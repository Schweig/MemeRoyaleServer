const express = require('express');
const router = new express.Router();
const uploadRoute = require('./userRoutes/signup');
router
// Add a binding to handle '/test'
    .get('/', function() {
    // render the /tests view
    })
    .use('/', uploadRoute);

module.exports = router;

