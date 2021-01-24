const execSync = require('child_process').execSync;
const path =  require('path');

function clickTest() {
  const res = getPlayingPosition();
  if (!res) return;
  console.log(res);
  // const timeTable = getTimeTable(res.title, res.artist);
  // console.log(timeTable);
}

/**
 * 再生中の曲情報（曲名、アーティスト名）と現在の再生時間を取得するメソッド
 * @return {{ title: string, artist: string, position: string }}
 *   曲名, アーティスト名, 再生時間
 */
function getPlayingPosition() {
  const iTunesOperatePath = path.join(__dirname, 'scripts', 'iTunesOperation.scpt');
  const script = 'osascript ' + iTunesOperatePath + ' "playing"';
  const currentTrack = runAndDecode(script);
  return currentTrack;
}

/**
 * 再生している曲のタイムテーブルを配列で取得するメソッド
 * @param {string} title 曲名
 * @param {string} artist アーティスト名
 * @return {{ time: number, lyrics: string }[]} 
 *   歌詞とその表示時刻の配列
 */
function getTimeTable(title, artist) {
  const findLyricsPath = path.join(__dirname, 'scripts', 'FinderOperation.scpt');
  const script = `osascript ${findLyricsPath} "${title}" "${artist}"`;
  const timeList = runAndDecode(script);
  if (!timeList) return;

  const timeRegex = /\[?([0-9\.]+)\] /;
  const timeTable = timeList.filter(n => n !== '').map(text => {
    const time = Number(timeRegex.exec(text)[1]);
    const lyrics = text.split('] ')[1];
    return { time, lyrics };
  });
  return timeTable;
}

/**
 * applescriptを実行してその戻り値をデコード・パース処理をしてJSONを返すメソッド
 * @param {string} script スクリプト実行コード
 * @return {JSON} JSONオブジェクト
 */
function runAndDecode(script) {
  const response = execSync(script);
  const decode = new TextDecoder().decode(response);
  if (!decode) return "";
  try {
    const json = JSON.parse(decode);
    return json;
  } catch (err) {
    alert(decode);
    throw new Error(err);
  }
}
