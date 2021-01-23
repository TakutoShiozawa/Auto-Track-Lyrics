const spawn = require('child_process').spawn;
const path =  require('path');

function clickTest() {
  console.log('aaa');
  const scriptPath = path.join(__dirname, 'scripts', 'applescript.scpt');
  const scriptRunner = spawn('osascript', [scriptPath, 'currenttrack']);
  scriptRunner.stdout.on('data', function (data) {
    alert(data);
  });
}