//get all the libraries we need
var Connection = require('tedious').Connection;
var Request = require('tedious').Request;
var Types = require('tedious').Types;
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var sql = require("mssql");
require("msnodesqlv8");

//configuration for the connection
var config = {
    server: '',
    userName: '',
    password: '',
    domain: '',
    option: {
        integratedSecurity: false, Trusted_Connection: false
    }
};

//attempt a connection with the sql server
var connection = new Connection(config);

//if connection is success then good if not throw err
connection.on('connect', function (err) {
    if (err) {
        throw err;
    }
});

//send index.html
app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

//execute the sql statement
function executeStatement(socket, year_week, querry_type) {
    //send info to get the construct sql statement
    var q = make_query(year_week);
    var request = new Request(q, function (err) {
        if (err) {
            socket.emit('decline', 'SQL request failed');
        }
    });
    var bool = 1;
    var issue = "";

    var result = "";
    //if request return rows get them column by column and send them to client
    request.on('row', function (columns) {
        columns.forEach(function (column) {
            if (column.value === null) {
                if (querry_type == 1) {
                    socket.emit('expand_data', "NULL");
                }
                else if (querry_type == 0) {
                    console.log('NULL');
                }
            }
            else {
                if (querry_type == 1) {
                    socket.emit('expand_data', column.value);
                }
                else {
                    if (bool == 1) {
                        issue = column.value;
                        bool = 0;
                    }
                    result += column.value + " ";
                }
            }
        });
        result.trim();
        if (querry_type == 0) {
            socket.emit('data', result);
        }
        else if (querry_type == 1) {
            socket.emit('expand_data', "<br \>");
        }
        result = "";
    });

    request.on('requestCompleted', function (rowCount, more) {
        //when executaion is done send done message to client
        if (querry_type == 0) {
            socket.emit('data', 'done');
        }
        if (querry_type == 1) {
            socket.emit('expand_data', 'done');
        }
    });
    connection.execSql(request);
}

//if socket connects listen for calls
io.sockets.on('connection', function (socket) {
    //debug helper
    socket.on('print', function (msg) {
        console.log(msg);
    });
    //if a query call is made get message and see the typr of message it is
    socket.on('querry', function (msg) {
        var safe_querry = msg.includes("Safe_Querry:")
        var version_querry = msg.includes("Version_Querry:")
        if (safe_querry || version_querry) {
            executeStatement(socket, msg, 1);
        }
        else {
            //check if msg is valid 
            var valid_format = check_if_valid(msg);
            if (valid_format != "") {
                var year_week = msg.split(" ");
                socket.emit('accept', valid_format);
                executeStatement(socket, valid_format, 0);
            }
            else {
                socket.emit('decline', "The input dates are not acceptable!");
            }
        }
    });
});

//if socket connects and disconnects
io.on('connection', function (socket) {
    socket.on('disconnect', function () {
    });
});


http.listen(3000, "0.0.0.0", function () {
});



//checks to see if date is valid
function check_if_valid(msg) {
    var querryParams = "";
    var params = msg.split(" ");
    //four numbers are required
    if (isNaN(params[0]) && isNaN(params[1]) && isNaN(params[2]) && isNaN(params[3])) {
        return "";
    }

    //from year has to be between current year and 2016
    if (!isNaN(params[0])) {
        var d = new Date();
        var c_y = d.getFullYear();
        var fy = parseInt(params[0]);
        if (fy < 2016 || fy > c_y) {
            return "";
        }
        querryParams += "FY: " + params[0] + " ";
    }

    //from week has to be between 1 and 52
    if (!isNaN(params[1])) {
        var fw = parseInt(params[1]);
        if (fw < 1 || fw > 52) {
            return "";
        }
        querryParams += "FW: " + params[1] + " ";
    }

    //to year has to be between 2016 and current year
    if (!isNaN(params[2])) {
        var d = new Date();
        var c_y = d.getFullYear();
        var ty = parseInt(params[2]);
        if (ty < 2016 || ty > c_y) {
            return "";
        }
        querryParams += "TY: " + params[2] + " ";
    }
    //to week has to be between 1 and 52
    if (!isNaN(params[3])) {
        var tw = parseInt(params[3]);
        if (tw < 1 || tw > 52) {
            return "";
        }
        querryParams += "TW: " + params[3];
    }

    return querryParams;
    
}
//construct the querries --the querries are taken out for security reasons
function make_query(year_week) {
    var querry = "";
    var d = new Date();
    var c_y = d.getFullYear();
    var ty = c_y;
    var tw = 52;
    var fy = 2016;
    var fw = 1;
    var qry_inpts = year_week.split(" ");
    //check for type of query
    if (qry_inpts[0] == "Safe_Querry:") {
        //get dates from array
        for (var i = 0; i < qry_inpts.length; i++) {
            if (qry_inpts[i] == "FY:") {
                fy = parseInt(qry_inpts[i + 1]);
            }
            else if (qry_inpts[i] == "FW:") {
                fw = parseInt(qry_inpts[i + 1]);
            }
            else if (qry_inpts[i] == "TY:") {
                ty = parseInt(qry_inpts[i + 1]);
            }
            else if (qry_inpts[i] == "TW:") {
                tw = parseInt(qry_inpts[i + 1]);
            }
        }
        //extract the patch and version information
        var ddc = qry_inpts[1].replace(/_/g, " ");
        var patch = qry_inpts[2].charAt(qry_inpts[2].length - 1);
        var version = qry_inpts[2].slice(0, -1);
        querry = "";
        
        return querry;
    }
    else if (qry_inpts[0] == "Version_Querry:") {
        //get dates from array
        for (var i = 0; i < qry_inpts.length; i++) {
            if (qry_inpts[i] == "FY:") {
                fy = parseInt(qry_inpts[i + 1]);
            }
            else if (qry_inpts[i] == "FW:") {
                fw = parseInt(qry_inpts[i + 1]);
            }
            else if (qry_inpts[i] == "TY:") {
                ty = parseInt(qry_inpts[i + 1]);
            }
            else if (qry_inpts[i] == "TW:") {
                tw = parseInt(qry_inpts[i + 1]);
            }
        }

        //extract patch and version
        var patch = "";
        var version = "";
        if (qry_inpts[qry_inpts.length - 1].charAt(qry_inpts[qry_inpts.length - 1].length - 1) == '0') {
            patch = qry_inpts[qry_inpts.length - 1].charAt(qry_inpts[qry_inpts.length - 1].length - 1) + qry_inpts[qry_inpts.length - 1].charAt(qry_inpts[qry_inpts.length - 1].length - 2) + qry_inpts[qry_inpts.length - 1].charAt(qry_inpts[qry_inpts.length - 1].length - 3);
            version = qry_inpts[qry_inpts.length - 1].slice(0, -3);
        }
        else {
            patch = qry_inpts[qry_inpts.length - 1].charAt(qry_inpts[qry_inpts.length - 1].length - 1);
            version = qry_inpts[qry_inpts.length - 1].slice(0, -1);
        }
        querry = "";
        return querry;
    }
    else {
        //get all the dates from the array
        for (var i = 0; i < qry_inpts.length; i++) {
            if (qry_inpts[i] == "FY:") {
                fy = parseInt(qry_inpts[i + 1]);
            }
            else if (qry_inpts[i] == "FW:") {
                fw = parseInt(qry_inpts[i + 1]);
            }
            else if (qry_inpts[i] == "TY:") {
                ty = parseInt(qry_inpts[i + 1]);
            }
            else if (qry_inpts[i] == "TW:") {
                tw = parseInt(qry_inpts[i + 1]);
            }
        }
        //construct the sql statement
        querry = "";
        return querry;
    }

}