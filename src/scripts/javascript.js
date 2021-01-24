const execSync = require('child_process').execSync;
const path =  require('path');

function clickTest() {
  const res = getCurrentTrack();
  console.log(res);
  const timeTable = getTimeTable(res.title, res.artist);
  console.log(timeTable);
}

function getCurrentTrack() {
  const iTunesOperatePath = path.join(__dirname, 'scripts', 'iTunesOperation.scpt');
  const response = execSync(`osascript ${iTunesOperatePath} "currenttrack"`);
  const json = new TextDecoder().decode(response);
  const currentTrack = JSON.parse(json);
  return currentTrack;
}

function getTimeTable(title, artist) {
  const findLyricsPath = path.join(__dirname, 'scripts', 'FinderOperation.scpt');
  const response = execSync(`osascript ${findLyricsPath} "${title}" "${artist}"`);
  const timeTable = new TextDecoder().decode(response);
  return timeTable;
}