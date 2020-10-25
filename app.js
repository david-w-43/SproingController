// TODO:
//  - Allow multiple file upload. Timestamp + ID within batch?
//  - Rewriting it to not use SSH, use child_process instead
//  - Display faulty images with bounding boxes for faults, 
//    labelled with confidence of failure points (confidence -> opacity)
//  - No need for scaling anymore

// OK, HLA-l, HLA-r, OK, SPR-l, SPR-r

// Configuration file
var CONFIG = require('./config.json');

// Required modules
var formidable = require('formidable');
var fs = require('fs');
const http = require('http');

// SSH as workaround to run external programs
// const {NodeSSH} = require('node-ssh')
// const ssh = new NodeSSH()

// // For starting other processes
// const { exec, execSync } = require('child_process');
// var mlchild;
// var mloutput = '';

// Sharp needed for image preprocessing
const sharp = require('sharp');
const { SSL_OP_EPHEMERAL_RSA } = require('constants');
const sizeX = CONFIG.inputX;
const sizeY = CONFIG.inputY;

// Path to save images to
const savepath = CONFIG.imgSavePath;

// Path of ML executable
const mldir = CONFIG.ingestScriptDir;
const mlname = CONFIG.ingestScriptName;

// Server hostname and port
const hostname = CONFIG.serverHostname;
const port = CONFIG.port;

// Struct for storing output
function Output(timestamp, pass, img, ok, ls, rs, lhla, rhla) {
    this.timestamp = timestamp,
        this.pass = pass;
    this.img = img
    this.ok = ok;
    this.ls = ls;
    this.rs = rs;
    this.lhla = lhla;
    this.rhla = rhla;
}

// Array for storing failed inputs
var outputs = [];

// Creates a server
const server = http.createServer(function (req, res) {
    if (req.url == '/fileupload') // When /fileupload is requested
    {
        res.writeHead(200, { 'Content-Type': 'text/html' });

        // Get and format date/time
        var timestamp = new Date().toISOString().replace(/:/g, '-').replace(/Z/gi, '');

        // Create a new form
        var form = new formidable.IncomingForm();
        form.parse(req, function (err, fields, files) {
            if (files.filetoupload.path) 
            {
                // Get temp location and location to save to
                var oldpath = files.filetoupload.path;
                var newpath = savepath + timestamp + '.png';

                // Resize image and save to correct path
                sharp(oldpath)
                    .flatten()
                    .resize(sizeX, sizeY)
                    .toFormat('png')
                    .toFile(newpath, function (err) {
                        if (err) throw err;
                        // Success message
                        console.log('Image saved to ' + newpath);
                        res.write('Image successfully uploaded as ' + newpath);

                        // Run image through ML program
                        runML(newpath, timestamp);
                    });
            }
        });

        
        res.write('<a href="/view" >View failures</a>');
        res.write('<a href="/">Back</a>');

        res.end();
    } else if (req.url == '/view') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.write('Fails:');

        // Format table, set headings
        res.write('<table style="width:100%">          ');
        res.write('    <tr>                            ');
        res.write('        <th>Timestamp</th>          ');
        res.write('        <th>Image</th>              ');
        res.write('        <th>Likely faults</th>      ');
        res.write('    <tr>                            ');

        // Display list of failed items
        for (var i = 0, len = outputs.length; i < len; i++) {
            let test = outputs[i];

            // Find what's wrong with the thing and overlay image using sharp


            if (test.pass == false) {
                console.log('Displaying ' + test.timestamp);
                // Add row to table
                res.write('<tr>                            ');
                res.write('<td>' + test.timestamp + '</td> ');
                res.write('<td><img src="file://' + test.img + '"></img></td>');
                res.write('<td> LIKELY FAULTS... </td> ');
                res.write('</tr>                           ');
            }
        }
        res.write('</table>                            ');
        res.write('<a href="/">Back</a>');

        res.end();

    } else {
        // Main page to display
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.write('<form action="fileupload" method="post" enctype="multipart/form-data">');
        res.write('<input type="file" multiple name="filetoupload"><br>');
        res.write('<input type="submit">');
        res.write('</form>');
        res.write('<a href="/view" >View failures</a>');
        return res.end();
    }
});

server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});

function runML(imgpath, timestamp) {
    // Construct command
    var command = CONFIG.ingestScriptDrive + ' && cd ' + mldir + ' && python ' + mlname + ' ' + imgpath;
    console.log(command);

    // Execute ML processing, record output
    const { exec } = require('child_process');
    exec(command, (err, stdout, stderr) => {
        if (err) {
            console.error(`exec error: ${err}`);
            return;
        }

        console.log('LIVE: ' + stdout);
        var mlout = stdout.split(',');
        console.log('Extracted: ' + mlout);

        // Determine whether pass or fail
        var pass;
        if (mlout[0] == 'NOK') { pass = false } else { pass = true; }

        // Add output to list
        var out = new Output(timestamp, pass, imgpath, mlout[1], mlout[2], mlout[3], mlout[4], mlout[5])
        outputs.push(out);
    });
}

