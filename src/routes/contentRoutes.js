const express = require('express');
const router = new express.Router();
const uploadRoute = require('./contentRoutes/upload');
router
// Add a binding to handle '/test'
    .get('/', function() {
    // render the /tests view
    })
    .use('/', uploadRoute);

module.exports = router;

