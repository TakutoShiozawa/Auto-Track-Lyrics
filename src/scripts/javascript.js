const execSync = require('child_process').execSync;
const path =  require('path');

const startEl = document.getElementById('start');
const stopEl = document.getElementById('stop');
const titleEl = document.getElementById('title');
const artistEl = document.getElementById('artist');
const positionEl = document.getElementById('position');
const lyricsEl = document.getElementById('lyrics');

//* 再生中の曲名・アーティスト名
let nowTitle = '';
let nowArtist = '';
//* Interval処理をする変数。clearするために外部で設定
let repeatGet;
let repeatChange;
let countingUp;
//* 再生時間
let playbackTime = 0;
let nowPosition = 0;
let countUpStart;
//* タイムテーブルの時間表（配列）
let timeArray = [];
//* アラート表示させるフラグ
let alertOn = true;

function repeatGetPosition() {
  repeatGet = setInterval(function() {
    const res = getPlayingPosition();
    countUpStart = new Date();
    if (!res) return;

    const { title, artist, position } = res;
    //* 曲が変わった場合、フロントを書き換え
    if (title !== nowTitle || artist !== nowArtist) {
      alertOn = true;
      console.log('change!');
      setTrackInfo(title, artist);
    }
    nowPosition = position;
  }, 2000);
}

function changeLyricsColor() {
  repeatChange = setInterval(function() {
    const liElements = lyricsEl.children;
    for (let i = 0; i < liElements.length; i++) {
      liElements[i].className = timeArray[i] < playbackTime ? 'red' : '';
    }
  }, 100);
}

function countUpTime() {
  countingUp = setInterval(function() {
    const nowTime = new Date();
    const elapsedTime = ((nowTime.getTime() - countUpStart.getTime()) / 1000);
    playbackTime = nowPosition + elapsedTime;
    positionEl.textContent = '再生時間： ' + Math.floor(playbackTime);
  }, 100);
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
 * タイムテーブルが存在しないときに再生中の歌詞を取得するメソッド
 * @return {string[]} 歌詞の配列
 */
function getOriginalLyrics() {
  const iTunesOperatePath = path.join(__dirname, 'scripts', 'iTunesOperation.scpt');
  const script = 'osascript ' + iTunesOperatePath + ' "lyrics"';
  const lyrics = runAndDecode(script);
  return lyrics;
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
    if (alertOn) {
      alert(decode);
    }
    alertOn = false;
    return '';
  }
}

/**
 * 曲が更新された時にフロントの曲情報を書き換え
 * @param {string} title 曲名
 * @param {string} artist アーティスト名
 */
function setTrackInfo(title, artist) {
  nowTitle = title;
  nowArtist = artist;
  titleEl.textContent = nowTitle;
  artistEl.textContent = nowArtist;

  const timeTable = getTimeTable(title, artist);
  let lyrics;
  if (timeTable) {
    //* タイムテーブルが存在する時、色替え機能を開始
    //* インターバル処理の多重起動を防止
    clearInterval(repeatChange);
    changeLyricsColor();
    timeArray = timeTable.map(n => n.time);
    lyrics = timeTable.map(n => n.lyrics);
  } else {
    //* タイムテーブルが存在しない時、色替え機能を停止
    clearInterval(repeatChange);
    timeArray = [];
    lyrics = getOriginalLyrics();
  }

  let lyricsHtml = '';
  lyrics.forEach((lyr) => {
    lyricsHtml += `<li>${lyr}</li>`;
  });
  lyricsEl.innerHTML = lyricsHtml;
}

startEl.addEventListener('click', function() {
  repeatGetPosition();
  countUpStart = new Date();
  countUpTime();
  startEl.className = "display-none";
  stopEl.className = "display";
});

stopEl.addEventListener('click', function() {
  clearInterval(repeatGet);
  clearInterval(repeatChange);
  clearInterval(countingUp);
  startEl.className = "display";
  stopEl.className = "display-none";
});
