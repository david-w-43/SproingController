// TODO:
//  - Allow multiple file upload. Timestamp + ID within batch?
//  - Rewriting it to not use SSH, use child_process instead
//  - Display faulty images with bounding boxes for faults, 
//    labelled with confidence of failure points (confidence -> opacity)

// Configuration file
var CONFIG = require('./config.json');

// Required modules
var formidable = require('formidable');
var fs = require('fs');
const http = require('http');

// Sharp needed for image preprocessing
const sharp = require('sharp');
const size = CONFIG.inputSize;

// SSH as workaround to run external programs
const {NodeSSH} = require('node-ssh')
const ssh = new NodeSSH()

ssh.connect(
{
    host: 'localhost',
    username: 'david',
    password: fs.readFileSync('./sshpwd', 'utf8') // SSH password stored in separate file!
})

// Path to save images to
const savepath = CONFIG.imgSavePath;

// Path of ML executable
const mlpath = CONFIG.ingestScript;

// Server hostname and port
const hostname = CONFIG.serverHostname;
const port = CONFIG.port;

// Creates a server
const server = http.createServer(function (req, res) 
{   
    if (req.url == '/fileupload') // When /fileupload is requested
    {
        // Get and format date/time
        var timestamp = new Date().toISOString().replace(/:/g, '-').replace(/Z/gi, '');

        // Create a new form
        var form = new formidable.IncomingForm();
        form.parse(req, function (err, fields, files) 
        {
            // Get temp location and location to save to
            var oldpath = files.filetoupload.path;
            var newpath = savepath + timestamp + i + '.jpeg';

            // Resize image and save to correct path
            sharp(oldpath)
                .flatten()
                .resize(size, size)
                .toFormat('jpeg')
                .toFile(newpath, function(err)
                {
                    if (err) throw err;
                    // Success message
                    console.log('Image saved to ' + newpath);
                    res.write('Image successfully uploaded as ' + newpath);

                    // Run image through ML program
                    runML(newpath);

                    res.end();
                });
            
        });
    } else
    {
        // Main page to display
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.write('<form action="fileupload" method="post" enctype="multipart/form-data">');
        res.write('<input type="file" multiple name="filetoupload"><br>');
        res.write('<input type="submit">');
        res.write('</form>');
        return res.end();
    }
});

server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});

function runML(imgpath) 
{
    // Execute ML processing, log output for now
    ssh.execCommand('python ' + mlpath + ' ' + imgpath).then(function(result) 
    {
        console.log('STDOUT: ' + result.stdout)
        console.log('STDERR: ' + result.stderr)
    })
}