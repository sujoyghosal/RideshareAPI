var express = require("express");
const dse = require('dse-driver');

// Run Locally
var PORT = process.env.VCAP_APP_PORT || 8080;
console.log("Initializing Client...");
const client = new dse.Client({
    contactPoints: ['127.0.0.1'],
    keyspace: 'rideshare'
});

var allowCrossDomain = function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
    res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, Content-Length, X-Requested-With"
    );
    if ("OPTIONS" == req.method) {
        res.send(200);
    } else {
        next();
    }
};
var app = express();
app.use(allowCrossDomain);
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

var encryptedPw = '';

app.post("/createuser", function(req, res) {
    console.log("In createuser...");
    var fullname = req.body.fullname;
    var password = req.body.password;
    var email = req.body.email.toLowerCase();
    var mobile = req.body.mobile;
    encryptedPw = encryptPassword(password);
    var query = "INSERT INTO users (userid, fullname, encrypted_pw, email, mobile  ) VALUES (now(), " + "'" +
        fullname + "'," + "'" + encryptedPw + "'," + "'" + email + "'," + "'" + mobile + "')";
    console.log("Query = " + query);
    client.execute(query, function(err, result) {
        if (!err) {
            console.log("Successfully Created User");
            res.jsonp(result);
        } else {
            console.log("createuser Insert Failed: " + err);
            res.jsonp(err);
        }
    });
});

function encryptPassword(password) {
    const saltRounds = 10;
    return bcrypt.hashSync(password, saltRounds);
};
app.get("/getuser", function(req, res) {
    var email = req.param("email");
    client.execute("SELECT * FROM users WHERE email = '" + email + "' ALLOW FILTERING", function(err, result) {
        if (!err) {
            if (result && result.rows && result.rows.length > 0) {
                console.log("getuser result: " + JSON.stringify(result));
                res.jsonp(result.rows[0]);
            } else {
                console.log("No results");
                res.jsonp([]);
            }
        } else {
            console.log("getuser  Failed" + err);
            res.jsonp([]);
        }
    });
});

function checkPassword(password, hash) {
    return bcrypt.compareSync(password, hash);
    //return true;
};

// Listen for requests until the server is stopped
var http = require('http').Server(app);
console.log("Settting up listener");
http.listen(PORT, function() {
    console.log('listening on *:' + PORT);
});