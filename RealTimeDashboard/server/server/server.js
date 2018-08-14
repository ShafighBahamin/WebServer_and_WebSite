//get all libraries that we need
var Connection = require('tedious').Connection;
var Request = require('tedious').Request;
var Types = require('tedious').Types;
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var oracledb = require('oracledb');  
var marky = require('marky');

//configuration for the connection 
//the creds were taken out
var config = {
    server: '',
    userName: '',
    password: '',
    domain: '',
    option: {
        integratedSecurity: false, Trusted_Connection: false
    }
};

//attemp a connection
var connection = new Connection(config);

//on connection with the server print server
connection.on('connect', function (err) {
    if (err) {
        throw err;
    }
    console.log("connected");
});

//send the index.html file
app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

//execute the sql query q
function executeStatement(q) {

    //return a promise so the execution can stop to get resolved or rejected
    return new Promise((resolve, reject) => {
        var ret_arr = [];
        //attempt to execute the query
        var request = new Request(q, function (err) {
            if (err) {
                console.log("error in request");
                reject(-1);
            }
        });
        var bool = 1;
        var issue = "";

        var result = "";
        request.on('row', function (columns) {
            columns.forEach(function (column) {
                if (column.value === null) {
                    issue += column.value;
                    issue += "$ShafighIsAwesome$";
                }
                else {
                    issue += column.value;
                    issue += "$ShafighIsAwesome$";
                }
            });
            var tmp = issue.split("$ShafighIsAwesome$");
            ret_arr.push(tmp);
            issue = "";
        });
        request.on('requestCompleted', function (rowCount, more) {
            resolve(ret_arr);
        });
        connection.execSql(request);
    })
    
}

//listen for a connection
io.sockets.on('connection', function (socket) {

    //this call is for debugging purposes
    socket.on('print', function (msg) {
        console.log(msg);
    });

    //this call is for queries to be executed
    socket.on('querry', function (msg) {
        if (msg.includes("WeekButton") || msg.includes("DayButton")) {

            var tmp = msg.split(' ');
            var refresh_rate = 15;

            //check to see if the refresh rate is greater than fifteen
            if (!isNaN(parseInt(tmp[tmp.length - 1]))) {
                var num = parseInt(tmp[tmp.length - 1]);
                if (num > 15) {
                    refresh_rate = num;
                }
            }

            //send the msg to func to create the sql statements and execute them
            querriesForRealTimeDash(socket, msg);

            //call func for new data every so often
            setInterval(function () {
                querriesForRealTimeDash(socket, msg);
            }, 1000 * 60 * refresh_rate);
        }
    });
});

io.on('connection', function (socket) {
    socket.on('disconnect', function () {
    });
});

//litsen
http.listen(3000, "0.0.0.0", function () {
});


//here is where the query statements are made and called to be executed
function querriesForRealTimeDash(socket, query_type) {

    //vars to be used
    var info_arr = query_type.split(' ');
    var query_statement = "";
    var from_week;
    var to_week;
    var from_hour = "00:00:00";
    var to_hour = "23:59:59";
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var categories = [];
    var fiscal_weeks = [];
    var oracle_rows = [];
    var date_obj = new Date();
    var month = date_obj.getMonth();
    var day = date_obj.getDate();
    var year = date_obj.getFullYear();
    var hour = date_obj.getHours();
    var minutes = date_obj.getMinutes();
    var seconds = date_obj.getSeconds();
    var millisec = date_obj.getMilliseconds();
    var actual_month = (month + 1).toString();

    //get the month if only one digit add 0 to front
    var month_check = (month + 1).toString();
    if (month_check.length == 1) {
        actual_month = '0' + (month + 1).toString();
    }

    //construct a date string for a query
    var date = year.toString() + '-' + actual_month + '-' + day.toString() + ' ' + hour.toString() + ':' + minutes.toString() + ':' + seconds.toString() + '.' + millisec.toString();

    //this var is for the client to display, its the date but formated a little differently
    var d = year.toString() + '-' + day.toString() + '-' + actual_month  + ' ' + hour.toString() + ':' + minutes.toString() + ':' + seconds.toString() + '.' + millisec.toString();

    socket.emit('date', info_arr[1] + " " + d);
    
    query_statement = "SELECT * FROM [PPM].[dbo].[Categories];"
    //query the categories 
    executeStatement(query_statement).then((successMessage) => {

        categories = successMessage;
        query_statement = "SELECT * FROM [PPM].[dbo].[FiscalWeeks] WHERE FromDate <= '" + date + "' AND ToDate >= '" + date + "';";
        //query the fiscal week for a specific week
        executeStatement(query_statement).then((successMessage) => {
            
            socket.emit('accept', successMessage);

            console.log(successMessage);

            fiscal_weeks = successMessage;

            //extract the date from succesMessage 
            var tmp = fiscal_weeks[0][3].split(' ');
            var m = months.indexOf(tmp[1]);

            //Java subtracts four hours from the return value and so Im correcting the date 
            var nextday = new Date();
            nextday.setDate(parseInt(tmp[2]) + 1);
            var getCorrectDate = nextday.toString().split(' ');
            var correctDate = getCorrectDate[2];


            if ((m+1).toString().length == 1) {
                month = '0' + (m+1).toString();
            }

            //construct the from week string
            if (info_arr[0] == "DayButton") {
                from_week = month + "/" + day.toString() + "/" + tmp[3] + " " + from_hour;
            }
            else {
                from_week = month + "/" + correctDate + "/" + tmp[3] + " " + from_hour;
            }

            tmp = fiscal_weeks[0][4].split(' ');
            m = months.indexOf(tmp[1]);
            if ((m + 1).toString().length == 1) {
                month = '0' + (m + 1).toString();
            }

            //construct the to week string
            if (info_arr[0] == "DayButton") {
                to_week = month + "/" + day.toString() + "/" + tmp[3] + " " + to_hour;
            }
            else {
                to_week = month + "/" + tmp[2] + "/" + tmp[3] + " " + to_hour;
            }

            
            var primary = [];
            var secondary = [];
            var callType = info_arr[1];


            marky.mark('expensive operation');

            //call the oracle db to get raw data
            oracle_statement(from_week, to_week, callType).then((resolve) => {
                
                var entries = marky.stop('expensive operation');
                console.log("time oracle look up: " + entries.duration);

                oracle_rows = resolve;

                marky.mark('expensive operation');

                //here all is happening is that categories are being assigned to every row of raw data and when finished send data to client
                for (var i = 0; i < oracle_rows.length; i++) {

                    //init to unknown category
                    oracle_rows[i].DEEPDIVECATEGORY = "Unknown";
                    oracle_rows[i].HIGHERCATEGORY = "Unknown";

                    var dont_set = false;

                    for (var j = 0; j < categories.length; j++) {
                        //every category has a primary and secondary phrases
                        var prim = false;
                        var sec = false;
                        primary = (categories[j][1]).split(',');

                        if (categories[j][2] == null) {
                            secondary = [];
                        }
                        else {
                            secondary = (categories[j][2]).split(',');
                        }

                        for (var k = 0; k < primary.length; k++) {
                            //check if a row comment contains primary and secondray phrase
                            if (oracle_rows[i].TROUBLESHOOTCOMMENTS.toUpperCase().includes(primary[k].toUpperCase())) {
                                prim = true;
                                if (secondary.length == 0) {
                                    sec = true;
                                }
                                else {

                                    for (var u = 0; u < secondary.length; u++) {
                                        if (oracle_rows[i].TROUBLESHOOTCOMMENTS.toUpperCase().includes(secondary[u].toUpperCase())) {
                                            sec = true;
                                        }
                                    }

                                }
                            }
                        }
                        //if row comment contains primary and secondary phrase then assing category to the row and dont set this row again
                        if ((prim && sec) && dont_set == false) {
                            oracle_rows[i].DEEPDIVECATEGORY = categories[j][0];
                            oracle_rows[i].HIGHERCATEGORY = categories[j][3];
                            dont_set = true;
                            break;
                        }
                        //if only primary phrase match set category but this row could be set again if a both a prim and secon match occur
                        if (prim && dont_set == false) {
                            oracle_rows[i].DEEPDIVECATEGORY = categories[j][0];
                            oracle_rows[i].HIGHERCATEGORY = categories[j][3];
                        }
                    }
                }
                var entries = marky.stop('expensive operation');
                console.log("time assigning categs: " + entries.duration);
                socket.emit('data', oracle_rows);
            })
            .catch((rejection) => {
                //catch rejection
                socket.emit('decline', "Could not retrieve data from oracle db");
            });
        })
        .catch((rejection) => {
            //catch rejection
            socket.emit('decline', "Could not retrieve fiscal week data from sql db");
        });
    })
    .catch((rejection) => {
        //catch rejection
        socket.emit('decline', "Could not retrieve categories data from sql db");
    });

}


function oracle_statement(dtFrom, dtTo, callType) {

    marky.mark('expensive operation');

    //return a new promise so the caller waits for the resolve or reject
    return new Promise((resolve, reject) => {

        //attempt a connection with oracle db
        //the creds were taken out.
        oracledb.getConnection({
            user: "",
            password: "",
            connectString: ""
        }, function (err, connection) {
            if (err) {
                reject(err.message);
                console.error(err.message);
                return;
            }

            //execute this casserole of nonesense and return the data
            //the query was taken put due to security -- now its empty
            connection.execute("",
                [], {
                    outFormat: oracledb.OBJECT // make sure we get object back and nothing else
                },
                function (err, result) {
                    if (err) {
                        console.error(err.message);
                        reject(err.message);
                        doRelease(connection);
                        return;
                    }
                    resolve(result.rows);
                    doRelease(connection);
                }); 

            });
        var entries = marky.stop('expensive operation');
        console.log("time oracle query: " + entries.duration);
    })
}

//this is for the oracle connection, it releases it 
function doRelease(connection) {
    connection.release(
        function (err) {
            if (err) { console.error(err.message); }
        }
    );
}
