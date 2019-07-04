var express = require("express");
var cassandra = require('cassandra-driver');
var generator = require('generate-password');
var nodemailer = require('nodemailer');
var request = require("request");
var async = require('async');
var geolib = require('geolib');
const dse = require('dse-driver');
var fs = require('fs');
//const bcrypt = require('bcryptjs');
const bcrypt = require('bcryptjs');
var countryStateCity = require("country-state-city")

// Run Locally
var PORT = process.env.VCAP_APP_PORT || 9090;
console.log("Initializing Client...");
const client = new dse.Client({
    //    contactPoints: ['104.196.104.248'],
    //contactPoints: ['35.185.27.148'],
    contactPoints: ['127.0.0.1'],
    keyspace: 'rideshare'
        //authProvider: new dse.auth.DsePlainTextAuthProvider('cassandra', 'cassandra')
        //authProvider: new dse.auth.DseGssapiAuthProvider()
});

console.log("Initialized Client...");
/*const client = new dse.Client({
    contactPoints: ['162.241.222.176'],
    keyspace: 'freekarma',
    authProvider: new dse.auth.DsePlainTextAuthProvider('cassandra', 'cassandra')
});*/

var transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        type: 'OAuth2',
        clientId: "991979531146-rdoiba5l9mctvl73eue2037eon731kei.apps.googleusercontent.com",
        clientSecret: "jTpcWci-Uh1ZtsXWzcAAGsKu"
    }
});

var allowCrossDomain = function(req, res, next) {
    //res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
    res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, Content-Length, X-Requested-With"
    );
    //res.setHeader("Access-Control-Allow-Headers", req.getHeader("Access-Control-Request-Headers"));
    // intercept OPTIONS method
    if ("OPTIONS" == req.method) {
        res.send(200);
    } else {
        next();
    }
};
var app = express();
var allentities = [];
app.use(allowCrossDomain);
//app.use(express.bodyParser());
app.use(express.urlencoded());
app.use(express.json());
var bodyParser = require('body-parser');
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

var encryptedPw = '';

function cleanse(v, r) {
    if (v == null)
        return r;
    else
        return v;
}

app.get("/", function(req, resp) {
    //    resp.jsonp(rootTemplate);
    var out = "Hey, are you looking for something?";
    resp.jsonp(out);
});

app.get("/getrides", function(req, res) {
    var paramname = req.param("paramname");
    var paramvalue = req.param("paramvalue");
    var context = req.param('context');

    console.log("@@@@ Getrides paramname = " + paramname + ", paramvalue = " + paramvalue);
    var date = new Date();
    var oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);
    var rides_query = "SELECT * FROM events WHERE time <= " + date.getTime() + " AND  time >= " + oldDate.getTime() + " "
    if (context && context.length > 1)
        rides_query += "AND context = '" + context + "' ";
    if (paramname === "email")
        rides_query += "AND email = '" + paramvalue.replace(/"/g, "") + "' ";
    else if (paramname === "place") {
        var o = JSON.parse(paramvalue);
        if (o.hasOwnProperty('country')) {
            rides_query += "AND country = '" + o.country.name + "' ";
        }
        if (o.hasOwnProperty('state')) {
            rides_query += "AND state = '" + o.state.name + "' ";
        }
        if (o.hasOwnProperty('city')) {
            rides_query += "AND city = '" + o.city.name + "' ";
        }
    }
    rides_query += " LIMIT 100 ALLOW FILTERING";
    console.log("@@@@ Getrides rides_query = " + rides_query);
    client.execute(rides_query, function(err, result) {
        if (!err) {
            if (result && result.rows && result.rows.length > 0) {
                res.jsonp(result.rows);
            } else {
                console.log("No results");
                res.jsonp([]);
            }
        } else {
            console.log("Read Failed" + err);
            res.jsonp(err);
        }

    });
});

app.get("/getneeds", function(req, res) {
    var emergency = req.param('emergency');
    if (!emergency || emergency == undefined)
        emergency = false;
    var context = '';
    if (emergency === 'true')
        context = 'Emergency'
    else
        context = 'Need'
    var paramname = req.param("paramname");
    var paramvalue = req.param("paramvalue");
    console.log("@@@@ Getrides paramname = " + paramname + ", paramvalue = " + paramvalue);
    var rides_query = '';
    if (paramname === "uuid")
        rides_query = " uuid = ' + paramvalue + ' AND context = '" + context + "' ";
    else if (paramname === "place") {
        var o = JSON.parse(paramvalue);
        rides_query = " country = '" + o.country.name + "' AND state = '" + o.state.name + "' AND city = '" + o.city.name + "' AND context = '" + context + "' ";
    }
    console.log("@@@@ Getrides rides_query = " + rides_query);
    client.execute("SELECT * FROM events where " + rides_query + " ALLOW FILTERING", function(err, result) {
        if (!err) {
            if (result && result.rows && result.rows.length > 0) {
                res.jsonp(result.rows);
            } else {
                console.log("No results");
                res.jsonp([]);
            }
        } else {
            console.log("Read Failed" + err);
            res.jsonp(err);
        }

    });
});

app.get("/updateuser", function(req, res) {
    var id = req.param("id");
    var pw = req.param('password');
    console.log("PW received = " + pw);
    if (!id) {
        console.log("#####updateuser - received null user id");
        return;
    }
    if (!pw) {
        console.log("#####updateuser - received null pw");
        return;
    }
    var query = "UPDATE users SET pw =  '" + encryptPassword(pw) + "' WHERE id = " + id;
    console.log("updateuser Query = " + query);
    client.execute(query, function(err, result) {
        if (!err) {
            console.log("Success updateuser");
            res.jsonp("SUCCESSFULLY UPDATED USER");
        } else {
            console.log("updateuser Failed" + err);
            res.jsonp("updateuser Failed" + err);
        }

    });
});
app.get("/updateusersettings", function(req, res) {
    var id = req.param("id");
    var push = req.param('push_notification');
    if (!id) {
        console.log("#####updateusersettings - received null primary key");
        res.jsonp("Update Failed")
        return;
    }
    if (push == null || push == undefined) {
        push = false;
    }
    var query = "UPDATE users SET preferences = { 'push_notifications': '" + push + "' } WHERE id = " + id;
    console.log("updateusersettings Query = " + query);
    client.execute(query, function(err, result) {
        if (!err) {
            console.log("Success updateusersettings");
            res.jsonp("SUCCESS");
        } else {
            console.log("updateusersettings Failed" + err);
            res.jsonp("updateusersettings Failed" + err);
        }

    });
});
app.post("/addvehicle", function(req, res) {
    var b = req.body.vehicle;
    var id = cassandra.types.Uuid.random(); //new uuid v4
    var timeId = cassandra.types.TimeUuid.now() //new instance based on current date
        //var date = timeId.getDate(); //date representation
    b.id = id;
    var reg = b.registration.replace(/ /g, '').toUpperCase();
    console.log("Vehicle Object = " + JSON.stringify(b));
    var query = "UPDATE users SET vehicles = vehicles + [{" +
        "registration: '" + reg + "', " +
        "hasac: " + b.hasac + ", " +
        "hasairbags: " + b.hasairbags + ", " +
        "color: '" + b.color + "', " +
        "make: '" + b.make + "', " +
        "model: '" + b.model + "', " +
        "year: " + b.year + ", " +
        "hasfmradio: " + b.hasfmradio + ", " +
        "seats: " + b.seats + ", " +
        "type: '" + b.type + "'" +
        " }] WHERE email = '" + req.body.email + "'";
    console.log("addvehicle Query = " + query);
    client.execute(query, function(err, result) {
        if (!err) {
            console.log("Success adding vehicle!");
            res.jsonp("Added vehicle successfully");
        } else {
            console.log("addvehicle Failed" + err);
            res.jsonp("addvehicle Failed" + err);
        }

    });
});
var receiver = {};

app.get("/canceloffer", function(req, res) {
    var id = req.param('id');
    var event_type = req.param('event_type');
    var query = "DELETE FROM events WHERE uuid = " + id;
    console.log("Query = " + query);
    client.execute(query, function(err, result) {
        // Run next function in series
        if (!err) {
            console.log("Successfully Deleted ride record.");
            deleteEvent(id, event_type, res);
            //res.send("Successfully Deleted Offer");
        } else {
            console.log("canceloffer delete Failed: " + err);
            res.send("Failed: " + err);
        }

        //callback(err, null);
    });
});

app.post("/createevents", function(req, res) {
    var b = req.body;
    console.log("Received Location Req Body as: " + JSON.stringify(b));
    var id = cassandra.types.Uuid.random(); //new uuid v4
    var time = new Date().getTime();

    var query = "INSERT INTO events (eventid, userid, vehicleid, fullname, email, mobile, command, currentlocation, eventtime)  \
        VALUES (" + id + ", " + b.userid + ", " + b.vehicleid + ", " +
        "'" + cleanse(b.fullname, '') + "'," +
        "'" + cleanse(b.email, '') + "'," +
        "'" + cleanse(b.phone, '') + "'," +
        "'" + cleanse(b.command, '') + "'," +
        "{ lat : " + b.location.latitude + ", lng : " + b.location.longitude + " }, " + time + ")";
    //   var query = "INSERT INTO events JSON " + JSON.stringify(b);
    console.log("Query = " + query);
    client.execute(query, function(err, result) {
        // Run next function in series
        if (!err) {
            console.log("Successfully Inserted Rideshare Driver Location Event.");
            //addEventToSubscriptions(id, b);
            res.send("CREATED");
        } else {
            console.log("createevent Insert Failed: " + err);
            res.send("Failed: " + err);
        }

        //callback(err, null);
    });
});
app.post("/driverlocation", function(req, res) {
    var b = req.body;
    console.log("Received Driver Location Req as: " + JSON.stringify(b));
    var id = cassandra.types.Uuid.random(); //new uuid v4
    var time = new Date().getTime();

    var query = "INSERT INTO driverlocation (eventid, userid, vehicle, fullname, email, mobile, context, currentlocation, eventtime)  \
        VALUES (" + id + ", " + b.userid + ", {" +
        "hasac: " + b.selectedVehicle.hasac + ", " +
        "hasairbags: " + b.selectedVehicle.hasairbags + ", " +
        "color: '" + cleanse(b.selectedVehicle.color) + "', " +
        "make: '" + cleanse(b.selectedVehicle.make) + "', " +
        "model: '" + cleanse(b.selectedVehicle.model) + "', " +
        "year: " + b.selectedVehicle.year + ", " +
        "hasfmradio: " + b.selectedVehicle.hasfmradio + ", " +
        "seats: " + b.selectedVehicle.seats + ", " +
        "type: '" + cleanse(b.selectedVehicle.type) + "', " +
        "registration: '" + cleanse(b.selectedVehicle.registration) + "'" +
        "}, " +
        "'" + cleanse(b.fullname, '') + "'," +
        "'" + cleanse(b.email, '') + "'," +
        "'" + cleanse(b.mobile, '') + "'," +
        "'" + cleanse(b.context, '') + "'," +
        "{ lat : " + b.location.lat + ", lng : " + b.location.lng + " }, " + time + ")";
    //   var query = "INSERT INTO events JSON " + JSON.stringify(b);
    console.log("Query = " + query);
    client.execute(query, function(err, result) {
        // Run next function in series
        if (!err) {
            console.log("Successfully Inserted Rideshare Driver Location Event.");
            //addEventToSubscriptions(id, b);
            res.jsonp({ "status": "Success" });
        } else {
            console.log("driverlocation Insert Failed: " + err);
            res.send("Failed: " + err);
        }

        //callback(err, null);
    });
});
app.post("/riderequest", function(req, res) {
    var b = req.body;
    //console.log("Received Driver Location Req as: " + JSON.stringify(b));
    var id = cassandra.types.Uuid.random(); //new uuid v4
    var time = new Date().getTime();

    var query = "INSERT INTO riderequest (eventid, userid, fullname, email, mobile, context, currentlocation, source, destination, status, eventtime)  \
        VALUES (" + id + ", " + b.userid + ", " +
        "'" + cleanse(b.fullname, '') + "'," +
        "'" + cleanse(b.email, '') + "'," +
        "'" + cleanse(b.mobile, '') + "'," +
        "'" + cleanse(b.context, '') + "'," +
        "{ lat : " + b.location.lat + ", lng : " + b.location.lng + " }, " +
        "{ lat : " + b.source.lat + ", lng : " + b.source.lng + " }, " +
        "{ lat : " + b.destination.lat + ", lng : " + b.destination.lng + " }, " +
        "'" + cleanse(b.status, '') + "'," +
        time + ")";
    //   var query = "INSERT INTO events JSON " + JSON.stringify(b);
    console.log("Query = " + query);
    client.execute(query, function(err, result) {
        // Run next function in series
        if (!err) {
            console.log("Successfully Inserted Rideshare Ride Request Event.");
            //addEventToSubscriptions(id, b);
            res.jsonp({ "status": "Success" });
        } else {
            console.log("riderequest Insert Failed: " + err);
            res.send("Failed: " + err);
        }

        //callback(err, null);
    });
});
/*
app.post("/addVehicle", function(req, res) {
    var b = req.body;
    console.log("Received Add Vehicle Req Body as: " + JSON.stringify(b));
    var id = cassandra.types.Uuid.random(); //new uuid v4
    var timeId = cassandra.types.TimeUuid.now() //new instance based on current date
    var date = timeId.getDate(); //date representation
    b.id = id;

    var query = "INSERT INTO events (eventid, userid, vehicleid, fullname, email, mobile, command, currentlocation, eventtime)  \
        VALUES (" + id + ", " +
        "{ hasac : " + b.vehicleac + ", \
        hasairbags : " + b.vehicleairbags + ", \
            color : '" + cleanse(b.vehiclecolor, '') + "', \
            id : " + cassandra.types.Uuid.random() + ", \
            make : '" + cleanse(b.vehiclemake, '') + "', \
            model : '" + cleanse(b.vehiclmodel, '') + "', \
            hasFMRadio : " + cleanse(b.vehiclesafetylock, '') + ", \
            seats : " + b.vehicleseats + ", \
            type : '" + cleanse(b.vehicletype, '') + "', \
            year : " + b.vehicleyear + "}," +
        "'" + cleanse(b.fullname, '') + "'," +
        "'" + cleanse(b.email, '') + "'," +
        "'" + cleanse(b.phone, '') + "'," +
        "'" + cleanse(b.command, '') + "'," +
        "{ lat : " + b.location.latitude + ", lng : " + b.location.longitude + " }, null, " + b.userid + ")";
    //   var query = "INSERT INTO events JSON " + JSON.stringify(b);
    console.log("Query = " + query);
    client.execute(query, function(err, result) {
        // Run next function in series
        if (!err) {
            console.log("Successfully Inserted Rideshare Event record.");
            //addEventToSubscriptions(id, b);
            res.send("CREATED");
        } else {
            console.log("createevent Insert Failed: " + err);
            res.send("Failed: " + err);
        }

        //callback(err, null);
    });
});*/

function addEventToSubscriptions(id, b) {
    if (!b) {
        console.log("Could Not Create Event as null object received");
        return;
    }
    var type = b.country + '-';
    if (b.hasOwnProperty('state') && b.state != null && b.state.length > 0) {
        type += b.state + '-';
    }
    if (b.hasOwnProperty('city') && b.city != null && b.city.length > 0) {
        type += b.city + '-';
    }
    type += b.itemtype;
    type = type.trim().toUpperCase().replace(/ /g, "-").replace(/'/g, "-");
    b.event_type = type;
    query2 = "UPDATE subscriptions SET event_ids = event_ids + { " + id + " } WHERE event_type = '" + type + "'";
    console.log("addEventToSubscriptions Update Query: " + query2);
    client.execute(query2, function(err, result) {
        // Run next function in series
        if (!err) {
            console.log("Successfully subscriptions table with events added to set: ");
            if (mysocket) {
                console.log("##### Sending event " + type);
                //mysocket.broadcast.emit('matchingevent', o);
                io.sockets.in(type).emit('matchingevent', b);
                //io.sockets.emit('matchingevent', data);
                console.log("####Sent matchingevent");

                var msg = JSON.stringify(b.context + ": " + b.item + "@: " +
                    b.address + " " + b.city + " " + b.state + " " + b.country + ". Contact " + b.postedby + ": " +
                    b.phone_number + " / " + b.email);
                sendFCMPush("FreeKarma Event", b.context + ": " + b.item + " @" + b.city + " " + b.state, type);
                console.log("Success creating event and sending notifications!!");
            } else {
                console.log("#### mysocket is null");
                //res.send("EVENT CREATED BUT NOT BROADCAST DUE TO NULL SOCKET!");
            }

        } else {
            console.log("Updated Events table with rideevent Failed: " + err);
        }
    });

};
app.post("/contactus", function(req, res) {
    var b = req.body;
    //console.log("####Received Request Body: " + JSON.stringify(b));
    var query = "INSERT INTO userqueries (id, fullname, email, city, phone, subject, text) \
        VALUES (now(), " +
        "'" + b.fullname + "'," +
        "'" + b.email + "'," +
        "'" + b.city + "'," +
        b.phone + "," +
        "'" + b.subject + "'," +
        "'" + b.text + "')";
    console.log("Query = " + query);
    client.execute(query, function(err, result) {
        // Run next function in series
        if (!err) {
            console.log("Successfully Inserted record");
            res.send("CREATED");
        } else {
            console.log("contactus Insert Failed: " + err);
            res.send("Failed: " + err);
        }

        //callback(err, null);
    });
});

app.get("/getsubscriptionsforuser", function(req, res) {
    var id = req.param("id");
    client.execute("SELECT * FROM subscriptions WHERE subscribed_users CONTAINS " + id + " ALLOW FILTERING", function(err, result) {
        if (!err) {
            if (result && result.rows && result.rows.length > 0) {
                //console.log("getsubscriptionsforuser result: " + JSON.stringify(result));
                res.jsonp(result.rows);
            } else {
                console.log("No results");
                res.jsonp([]);
            }
        } else {
            console.log("Read Failed" + err);
            res.jsonp([]);
        }

    });
});

app.get("/unsubscribeuserfromevent", function(req, res) {
    var id = req.param("id");
    var event_type = req.param('event_type');
    if (!id) {
        console.log("#####unsubscribeuserfromevent - received null user id");
        return;
    }
    if (!event_type) {
        console.log("#####unsubscribeuserfromevent - received null event_type");
        return;
    }
    console.log("######Unsubscribing user from event " + event_type);
    var query = "UPDATE subscriptions SET subscribed_users =  subscribed_users - { " + id + " } WHERE event_type = '" + event_type + "'";
    console.log("Unsubscribe Query = " + query);
    client.execute(query, function(err, result) {
        if (!err) {
            console.log("Success unsubscribeuserfromevent");
            res.jsonp("SUCCESSFULLY UNSUBSCRIBED USER TO EVENT " + event_type);
        } else {
            console.log("unsubscribeuserfromevent Failed" + err);
            res.jsonp("unsubscribeuserfromevent Failed" + err);
        }

    });
});

function deleteEvent(id, event_type, res) {
    if (!id) {
        console.log("#####unsubscribeuserfromevent - received null user id");
        return;
    }
    if (!event_type) {
        console.log("#####unsubscribeuserfromevent - received null event_type");
        return;
    }
    console.log("######Unsubscribing user from event " + event_type);
    var query = "UPDATE subscriptions SET event_ids =  event_ids - { " + id + " } WHERE event_type = '" + event_type + "'";
    console.log("Delete ride event ID From Events Query = " + query);
    client.execute(query, function(err, result) {
        if (!err) {
            console.log("Success deleteEvent");
        } else {
            console.log("deleteEvent Failed" + err);
        }
        res.send("SUCCESS");
    });
}
app.get("/geteventsforuser", function(req, res) {
    var subscriptions = [];
    var id = req.param('id');
    if (!id) {
        console.log("Invalid user id for getEvents");
        res.jsonp([]);
        return;
    }
    async.series([

        // Read users and print to console
        function(callback) {
            var query = "SELECT * FROM SUBSCRIPTIONS WHERE subscribed_users CONTAINS " + req.param('id') + " ALLOW FILTERING";
            console.log(query);
            client.execute(query, function(err, result) {
                if (!err) {
                    console.log("geteventsforuser result: " + JSON.stringify(result));
                    if (result && result.rows && result.rows.length > 0) {
                        subscriptions = result.rows;
                    } else {
                        res.jsonp([]);
                        return;
                    }
                } else {
                    console.log("Read Failed" + err);
                    res.jsonp([]);
                    return;
                }
                callback(err, null);
            });
        },

        // Read users and print to the console
        function(callback) {
            if (!subscriptions || subscriptions.length == 0) {
                console.log("No subscribed event groups found");
                res.jsonp("No Groups Found");
                return;
            }
            console.log("Found " + subscriptions.length + " subscriptions.");
            var query = '';
            var event_ids = [];
            var all_event_ids = [];
            var all_events = [];
            for (var i = 0; i < subscriptions.length; i++) {
                event_ids = subscriptions[i].event_ids;
                if (event_ids && event_ids.length > 0) {
                    for (j = 0; j < event_ids.length; j++) {
                        all_event_ids.push(event_ids[j]);
                    }
                }
            }
            if (!all_event_ids || all_event_ids.length == 0) {
                console.log("####Could Not Find Any Events Matching User Subscriptions");
                res.jsonp([]);
                return;
            }
            if (all_event_ids && all_event_ids.length > 0) {
                var query = "SELECT * FROM events where uuid in (";
                var ids = '';
                for (i = 0; i < all_event_ids.length; i++) {
                    ids += all_event_ids[i];
                    if (i < all_event_ids.length - 1)
                        ids += ", "
                }
                query = query + ids + ")";
                console.log("GetEvents Query is " + query);
                client.execute(query, function(err, result) {
                    if (result && result.rows && result.rows.length > 0) {
                        all_events = result.rows;
                        //console.log("#### All events: " + JSON.stringify(all_events));
                        console.log("SUCCESSFULLY FETCHED EVENTS FOR USER");
                        res.jsonp(all_events);
                    } else {
                        console.log("Could not fetch events");
                        res.jsonp([]);
                    }
                });

            }
        },

    ], function(err, results) {
        // All finished, quit
        //process.exit();
    });
});

var geo_query = "";
app.get("/vicinityquery", function(req, res) {
    var latitude = req.param('latitude');
    var longitude = req.param('longitude');
    var radius = req.param('radius');
    var vicnityarray = [];
    if (latitude == null || latitude === undefined || longitude == null || longitude == undefined) {
        console.log("Did not receive valid lat/lng");
        return;
    }
    var query = "SELECT * from driverlocation limit 1000 ALLOW FILTERING";
    console.log("Vicinity Query = " + query);
    client.execute(query, function(err, result) {
        console.log("Vicinity Query with radius " + radius + "Result:" + JSON.stringify(result.rows));
        if (result && result.rows && result.rows.length > 0) {
            var rows = result.rows;
            for (i = 0; i < rows.length; i++) {
                if (rows[i].currentlocation && rows[i].currentlocation.lat && rows[i].currentlocation.lng) {
                    var d = geolib.getDistance({ latitude: rows[i].currentlocation.lat, longitude: rows[i].currentlocation.lng }, { latitude: latitude, longitude: longitude });
                    console.log(i + "-" + d);
                    if (d < radius)
                        vicnityarray.push(rows[i]);
                } else continue;
            }
            console.log("Found " + vicnityarray.length + " records within radius");
            res.jsonp(vicnityarray);
            return;
        } else {
            console.log("No records fetched for vicinity query: ");
            res.jsonp([]);
        }
    });
});

app.get("/passengersinvicinity", function(req, res) {
    var latitude = req.param('latitude');
    var longitude = req.param('longitude');
    var radius = req.param('radius');
    var vicnityarray = [];
    if (latitude == null || latitude === undefined || longitude == null || longitude == undefined) {
        console.log("Did not receive valid lat/lng");
        return;
    }
    var query = "SELECT * from riderequest limit 1000 ALLOW FILTERING";
    console.log("Vicinity Query = " + query);
    client.execute(query, function(err, result) {
        console.log("Passengers In Vicinity Result:" + JSON.stringify(result.rows));
        if (result && result.rows && result.rows.length > 0) {
            var rows = result.rows;
            for (i = 0; i < rows.length; i++) {
                if (rows[i].currentlocation && rows[i].currentlocation.lat && rows[i].currentlocation.lng) {
                    var d = geolib.getDistance({ latitude: rows[i].currentlocation.lat, longitude: rows[i].currentlocation.lng }, { latitude: latitude, longitude: longitude });
                    console.log(i + "-" + d);
                    if (d < radius)
                        vicnityarray.push(rows[i]);
                } else continue;
            }
            console.log("Found " + vicnityarray.length + " records within radius for passengersinvicinity");
            res.jsonp(vicnityarray);
            return;
        } else {
            console.log("No records fetched for passengersinvicinity query: ");
            res.jsonp([]);
        }
    });
});

app.post("/subscribeusertoevent", function(req, res) {
    var group = req.body.group;
    var id = req.body.id;
    if (group)
        group = group.trim().toUpperCase().replace(/ /g, "-").replace(/'/g, "");
    else {
        console.log("####Null Group received, cannot subscribe user to this event type");
        return;
    }
    if (!id) {
        console.log("####Null id received, cannot subscribe this user to this event type");
        return;
    }
    var query = "UPDATE subscriptions SET subscribed_users = subscribed_users + { " + id + " } WHERE event_type = '" + group + "'";
    console.log("Subscribe Event Query = " + query);
    client.execute(query, function(err, result) {
        // Run next function in series
        if (!err) {
            console.log("Successfully Subscribed To Event " + group);
            res.send("Successfully Subscribed To Event " + group);
        } else {
            console.log("subscribeusertoevent Insert Also Failed: " + err);
            res.send("Failed to add susbcription to this event type");
        }
    });
});

app.post("/createuser", function(req, res) {
    console.log("In createuser...");
    var fullname = req.body.fullname;
    var password = req.body.password;
    var email = req.body.email.toLowerCase();
    var mobile = req.body.mobile;

    encryptedPw = encryptPassword(password);

    var query = "INSERT INTO users (userid, fullname, encrypted_pw, email, vehicles, mobile  ) \
        VALUES (now(), " +
        "'" + fullname + "'," +
        "'" + encryptedPw + "'," +
        "'" + email + "'," + "{}" + "," +
        "'" + mobile + "')";
    console.log("Query = " + query);

    client.execute(query, function(err, result) {
        // Run next function in series
        if (!err) {
            console.log("Successfully Created User");
            res.send("CREATED");
        } else {
            console.log("createuser Insert Failed: " + err);
            res.send("Failed: " + err);
        }

        //callback(err, null);
    });
});
app.get("/getuser", function(req, res) {
    var email = req.param("email");
    client.execute("SELECT * FROM users WHERE email = '" + email + "' ALLOW FILTERING", function(err, result) {
        if (!err) {
            if (result && result.rows && result.rows.length > 0) {
                //console.log("getuser result: " + JSON.stringify(result));
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

function encryptPassword(password) {
    const saltRounds = 10;
    return bcrypt.hashSync(password, saltRounds);
};

function checkPassword(password, hash) {
    return bcrypt.compareSync(password, hash);
    //return true;
};

app.get("/loginuser", function(req, res) {
    var email = req.param("email").toLowerCase();
    var pw = req.param('password');
    var query = "SELECT * FROM users where email = '" + email + "' ALLOW FILTERING";
    console.log("Login Query: " + query);
    client.execute(query, function(err, result) {
        if (!err) {
            if (result && result.rows && result.rows.length > 0) {
                console.log("User Retrieved from DB is: " + JSON.stringify(result.rows[0]));
                if (bcrypt.compareSync(pw, result.rows[0].encrypted_pw) == true) {
                    console.log("Login Seccessful!")
                    res.jsonp(result.rows[0]);
                } else {
                    console.log("Password not correct");
                    res.send("Authentication Error");
                    //res.jsonp("Incorrect Password");
                }
            } else {
                console.log("User Not Found");
                res.jsonp("User Not Found");
            }
        } else {
            console.log("Read Failed" + err);
        }

    });
});

app.get("/sendresetpwmail", function(req, res) {
    var password = generator.generate({
        length: 9,
        numbers: true
    });
    var email = req.param('email');
    console.log("PW Reset for email = " + email);
    if (!email) {
        console.log("#####updateuser - received null email");
        return;
    }
    var id = null;
    var query = "SELECT * FROM users where email = '" + email + "' ALLOW FILTERING";
    client.execute(query, function(err, result) {
        if (!err) {
            if (result && result.rows && result.rows.length > 0) {
                id = result.rows[0].id;
                console.log("ID = " + id);
                if (id != null) {
                    var query2 = "UPDATE users SET pw =  '" + encryptPassword(password) + "' WHERE id = " + id;
                    console.log("updateuser Query = " + query2);
                    client.execute(query2, function(err, result) {
                        if (!err) {
                            console.log("Success updateuser");
                            var emailtext = "Your new FreeKarma app password is: " + password;
                            console.log("######sendresetpwmail updated password to Default. Sending mail = " + emailtext);
                            sendGridMail(req, res, emailtext);
                        } else {
                            console.log("sendresetpwmail query Failed" + err);
                            res.jsonp("sendresetpwmail query Failed" + err);
                            return;
                        }

                    });
                }
            } else {
                console.log("User Not Found");
                res.jsonp("User Not Found");
            }
        } else {
            console.log("Read Failed" + err);
            res.jsonp("sendresetpwmail Query Failed: " + err);
        }

    });

});

function sendmail(req, res, text) {

    transporter.sendMail({
        from: "sujoy.ghosal@gmail.com",
        to: req.param('email'),
        subject: 'Password Reset',
        text: text,
        auth: {
            user: 'sujoy.ghosal@gmail.com',
            refreshToken: '1/cmlvnBPn8-FCiim25R0J9c68zO1FTeaiYIzUGr_5ldw',
            accessToken: 'ya29.Glv-BAff-7QHfbnhJ5LvhexaatvSAWsi_pq13DvwoXXunD_EKB59VB86bVvFH38gAAw7UR5CLZxX0jmMLyF_laCvEwqv_nSyZbluWiVCD6V_v_0ko5nNW50hQjeo',
            expires: 3600
        }
    });
    console.log("Sent mail");
    res.send("Sent Mail");
}

function sendGridMail(req, res, text) {

    // using SendGrid's Node.js Library - https://github.com/sendgrid/sendgrid-nodejs
    //var sendgrid = require("sendgrid")("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");
    //console.log("SendGrid Object = " + JSON.stringify(sendgrid));
    const sgMail = require('@sendgrid/mail');
    //sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    sgMail.setApiKey('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');
    const msg = {
        to: 'sujoy.ghosal@gmail.com',
        from: 'no-replies@freekarma.com',
        subject: 'Your New FreeKarma Password',
        text: text,
        html: '<strong>' + text + '</strong>'
    };
    sgMail.send(msg);

    console.log("sendGridMail: Sent mail");
    res.send("Sent Mail");
}

app.get("/sendfcmpush", function(req, res) {

    sendFCMPush(req, res, '');
});

function sendFCMPush(title, text, topic) {
    if (!topic || topic.length < 2) {
        console.log("#### No topic received, not sending push");
        return;
    }
    if (!text || text.length < 2) {
        console.log("#### No text received, not sending push");
        return;
    }
    console.log("Sending FCM Push....");
    var options = {
        method: 'POST',
        url: 'https://cordova-plugin-fcm.appspot.com/push/freesend',
        headers: {
            'cache-control': 'no-cache',
            'access-control-allow-origin': '*',
            'content-type': 'application/json'
        },
        body: {
            recipient: topic,
            isTopic: 'true',
            title: title,
            body: text.replace(/\"/g, ""),
            apiKey: 'AAAAEiB_y3E:APA91bGk0Cjw-qChPhVVNm7XFK6lH6eJYdXYKD37cQtg8DsP4hDT1p9R8QAcj8w1w_9lt-YGFTSTBoXyW49VOwl6rCrWm_bThdPJKpu43mQi_AzNmDwEIaHD0BI9jzpbFCHcOuG_2Vx0',
            application: 'com.all.freekarma',
            customData: [{
                param: 'a',
                value: 'b'
            }]
        },
        json: true
    };

    request(options, function(error, response, body) {
        if (error) throw new Error(error);

        console.log(body);
        return ("SUCCESS");
    });
};

app.get("/getAllCountries", function(req, res) {
    console.log("Sending all Countries..");
    res.jsonp(countryStateCity.getAllCountries());
});

app.get("/getStatesOfCountry", function(req, res) {
    console.log("Sending all Countries..");
    res.jsonp(countryStateCity.getStatesOfCountry(req.param('id')));
});

app.get("/getCitiesOfState", function(req, res) {
    console.log("Sending all Cities of state..");
    res.jsonp(countryStateCity.getCitiesOfState(req.param('id')));
});

function startTimer() {
    //Simulate stock data received by the server that needs 
    //to be pushed to clients
    timerId = setInterval(() => {
        if (!sockets.size) {
            clearInterval(timerId);
            timerId = null;
            console.log(`Timer stopped`);
        }
        let value = ((Math.random() * 50) + 1).toFixed(2);
        //See comment above about using a "room" to emit to an entire
        //group of sockets if appropriate for your scenario
        //This example tracks each socket and emits to each one
        for (const s of sockets) {
            console.log(`Emitting value: ${value}`);
            s.emit('data', { data: value });
        }

    }, 2000);
}
// Listen for requests until the server is stopped
var http = require('http').Server(app);
var io = require('socket.io')(http);

var mysocket = null;
console.log("Settting up listener");
http.listen(PORT, function() {
    console.log('listening on *:' + PORT);
});
let timerId = null,
    sockets = new Set();
io.on('connection', function(socket) {
    console.log("Received a connection from socket " + socket);
    sockets.add(socket);
    console.log(`Socket ${socket.id} added`);
    if (!timerId) {
        //startTimer();
    }
    mysocket = socket;
    socket.on('clientdata', data => {
        console.log(data);
    });
    socket.on('room', function(room) {
        console.log("####Conecting client socket to room " + room);
        socket.join(room);
    });
    socket.on('leave', function(room) {
        console.log("####Disconecting client socket from room " + room);
        socket.leave(room);
    });
    socket.on('disconnect', () => {
        console.log(`Deleting socket: ${socket.id}`);
        sockets.delete(socket);
        console.log(`Remaining sockets: ${sockets.size}`);
    });
});