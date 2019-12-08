const express = require('./node_modules/express');
const bodyParser = require('./node_modules/body-parser');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const app = express();
const port = 3000;
const multer = require('multer');
const path = require('path');
const admin = require('firebase-admin');
const serviceAccount = require('./memetinder-f03bf-firebase-adminsdk-x40tp-241a513d14.json');
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  host: 'localhost',
  user: 'memeroyale',
  database: 'memeroyale',
  password: 'Memedev1!',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'gs://memetinder-f03bf.appspot.com',
});

const bucket = admin.storage().bucket();

const dest = '/tmp/uploads/';
const filename = (req, file, cb) => {
  crypto.pseudoRandomBytes(16, function(err, raw) {
    if (err) return cb(err);

    cb(null, raw.toString('hex') + path.extname(file.originalname));
  });
};
const allowedImagesExts = ['jpg', 'png', 'gif', 'jpeg'];
const allowedImagesExtsDot = ['.jpg', '.png', '.gif', '.jpeg'];
const fileFilter = (req, file, cb) =>
  cb(null, allowedImagesExts.includes(file.originalname.split('.').pop()));

const storage = multer.diskStorage({dest, filename});
const upload = multer({storage, fileFilter});
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({extended: true}));

// parse application/json
app.use(bodyParser.json());
app.use(express.static(__dirname + '/uploads'));
app.post('/auth', async (req, res) => {
  console.log(req.body);
  const username = req.body.username;
  try {
    const hash = crypto
        .createHash('sha256')
        .update(req.body.password)
        .digest('hex');
    const [
      val,
      fields,
    ] = await pool.execute(
        `select * from user where username = ? or email = ?`,
        [username, username],
    );
    const row = val[0];
    const user = {
      userid: row.id,
      username: row.username,
      email: row.email,
      create_time: row.create_time,
      level: row.level,
      last_login: row.last_login,
      birthday: row.birthday,
    };
    const pass = row.password;
    if (pass === hash) {
      delete user.password;
      const token = jwt.sign(user, 'johndenverfucks');
      res.send({token: token});
    } else {
      res
          .status(401)
          .contentType('text/plain')
          .end('Wrong Password');
    }
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.post('/signup', async (req, res) => {
  console.log(req.body);
  console.log(req.body.password);
  const username = req.body.username;
  const email = req.body.email;
  const birthday = req.body.birthday;
  if (req.body.password.length < 6) {
    return res.status(400).send('Password too short');
  }
  const hash = crypto
      .createHash('sha256')
      .update(req.body.password)
      .digest('hex');
  try {
    const [
      val,
      fields,
    ] = await pool.execute(
        `insert into user (username,email,password,create_time,level,last_login,birthday) values(?,?,?,now(),'starter',now(),?)`,
        [username, email, hash, birthday],
    );
    const user = {userid: val.insertId, username, email, birthday};
    const token = jwt.sign(user, 'johndenverfucks');
    return res.send(token);
  } catch (err) {
    console.log(err);
    return res.sendStatus(409);
  }
});

app.post('/feed', async (req, res) => {
  const token = req.body.user;
  const user = jwt.verify(token, 'johndenverfucks');
  try {
    const [
      val,
      fields,
    ] = await pool.execute(
        `select * from post where ID not in (select post from vote where voter = ?) order by rand ( ) limit 15  `,
        [user.userid],
    );
    res.send(val);
  } catch (e) {
    res.sendStatus(500);
  }
});

app.post('/vote', async (req, res) => {
  const token = req.body.user;
  const user = jwt.verify(token, 'johndenverfucks');
  const post = req.body.post;
  const type = req.body.type;
  try {
    await pool.execute(
        `insert into vote (post,voter,type,created_at) Values(?,?,?,now()) on duplicate key update type = ${type}`,
        [post, user.userid, type],
    );
    res.status(200).send(`{"result":"vote succeeded"}`);
  } catch (e) {
    res.sendStatus(500);
  }
});

app.get('/top', async (req, res) => {
  console.log('getting top')
  try {
    const [
      val,
      fields,
    ] = await pool.execute(`SELECT post, title,description, SUM(type) as total,username 
    FROM vote,post,user where vote.post = post.ID and poster = user.id
    GROUP BY post,title,description,username order by total desc limit 25;`);
    res.send(val);
  } catch (e) {
    res.sendStatus(500);
  }
});

app.post(
    '/upload',
    upload.single('file' /* name attribute of <file> element in your form */),
    async (req, res) => {
      try {
        if (req.file) {
          const tempPath = req.file.path;
          let file = tempPath.split('\\')[3];

          if (
            allowedImagesExtsDot.includes(
                path.extname(req.file.originalname).toLowerCase(),
            )
          ) {
            const uploaded = await bucket.upload(tempPath, {
              // Support for HTTP requests made with `Accept-Encoding: gzip`
              gzip: true,
              // By setting the option `destination`, you can change the name of the
              // object you are uploading to a bucket.
              metadata: {
                // Enable long-lived HTTP caching headers
                // Use only if the contents of the file will never change
                // (If the contents will change, use cacheControl: 'no-cache')
                cacheControl: 'public, max-age=31536000',
              },
            });
            file = bucket.file(uploaded[0].name);
            const options = {
              action: 'read',
              expires: '03-17-2125',
            };
            const url = await file.getSignedUrl(options);
            const decoded = jwt.verify(req.body.user, 'johndenverfucks');
            const title = req.body.title;
            const desc = req.body.desc;
            console.log(req.body);
            console.log(url[0]);
            console.log(decoded);
            await pool.execute(
                `insert into post (link,title,poster,created_at,description) values(?,?,?,now(),?)`,
                [url[0], title, decoded.userid, desc],
            );
            res
                .status(200)
                .contentType('text/plain')
                .end('File uploaded!');
          }
        } else {
          res
              .status(400)
              .contentType('text/plain')
              .end('Bad Request');
        }
      } catch (e) {
        res.sendStatus(500);
      }
    },
);
// Start the application after the database connection is ready
app.listen(port);
console.log('Listening on port 3000');
