const execSync = require('child_process').execSync;
const path =  require('path');

const startEl = document.getElementById('start');
const stopEl = document.getElementById('stop');
const autoEl = document.getElementById('auto');
const colorEl = document.getElementById('color');
const titleEl = document.getElementById('title');
const artistEl = document.getElementById('artist');
const timeEl = document.getElementById('time');
const positionEl = document.getElementById('position');
const progressEl = document.getElementById('progress');
const lyricsEl = document.getElementById('lyrics');

//* 再生中の曲名・アーティスト名・再生時間
let trackTitle = '';
let trackArtist = '';
let trackTime = 300;
//* Interval処理をする変数。clearするために外部で設定
let geterId;
let changerId;
let counterId;
//* 再生時間
let playbackTime = 0;
//* iTunesから取得した再生時間
let nowPosition = 0;
//* 再生時刻の取得時刻
let countUpStart;
//* タイムテーブルの時間表（配列）
let timeArray = [];
//* アラート表示させるフラグ
let alertOn = true;
//* オートスクロールさせる?
let isAuto = true;
//* フォントカラー
let fontColor = 'red';
const colorOption = ['red', 'blue', 'green', 'white'];

/**
 * 定期的にiTunesから再生時間などの情報を取得する
 *    曲が変更されたら新たに歌詞を取得する
 */
function repeatGetPosition() {
  geterId = setInterval(function() {
    const res = getPlayingPosition();
    if (!res) return;

    const { title, artist, time, position } = res;
    //* 曲が変わった場合、フロントを書き換え
    if (title !== trackTitle || artist !== trackArtist) {
      alertOn = true;
      setTrackInfo(title, artist, time);
    }

    //* 取得する時間は正確に刻んでおらず、ブレてしまうので、
    //* 秒数が取得時間よりも大きく（2秒程度）ずれていたら変更。
    if (Math.abs(nowPosition - position) > 3) {
      countUpStart = new Date();
      nowPosition = position;
    }
  }, 2000);
}

/** 再生箇所の歌詞を強調表示させる */
function changeLyricsColor() {
  changerId = setInterval(function() {
    const liElements = lyricsEl.children;
    for (let i = 0; i < liElements.length; i++) {
      //* タイムテーブルを参照し、再生時間よりも小さいものを強調表示
      liElements[i].className = timeArray[i] < playbackTime ? `passed ${fontColor}` : '';
    }

    //* 自動スクロールがONならば
    if (isAuto) {
      scrollToLyrics();
    }
  }, 100);
}

/** 連続して再生時間の更新させる */
function countUpTime() {
  counterId = setInterval(function() {
    //* iTunesから再生位置を取得した時間からの経過時間で計算
    const nowTime = new Date();
    const elapsedTime = ((nowTime.getTime() - countUpStart.getTime()) / 1000);
    playbackTime = nowPosition + elapsedTime;
    //* プログレスバーを更新
    progressEl.value = Math.floor(playbackTime / trackTime * 100);
    positionEl.textContent = Math.floor(playbackTime / 60) + ':' + ('0' + Math.floor(playbackTime % 60)).slice(-2);
  }, 100);
}

/**
 * 再生中の曲情報（曲名、アーティスト名）と現在の再生時間を取得するメソッド
 * @return {{ title: string, artist: string, time: string, position: number }}
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
  if (!decode) return '';
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
 * @param {string} time 再生時間
 */
function setTrackInfo(title, artist, time) {
  trackTitle = title;
  trackArtist = artist;
  //* 曲の再生時間を算出
  const splitTime = time.split(':');
  trackTime = Number(splitTime[0]) * 60 + Number(splitTime[1]);
  //* 表示更新
  titleEl.textContent = trackTitle;
  artistEl.textContent = trackArtist;
  timeEl.textContent = time;

  const timeTable = getTimeTable(title, artist);
  let lyrics;
  if (timeTable) {
    //* タイムテーブルが存在する時、色替え機能を開始
    //* インターバル処理の多重起動を防止
    clearInterval(changerId);
    changeLyricsColor();
    timeArray = timeTable.map(n => n.time);
    lyrics = timeTable.map(n => n.lyrics);
  } else {
    //* タイムテーブルが存在しない時、色替え機能を停止
    clearInterval(changerId);
    timeArray = [];
    lyrics = getOriginalLyrics();
  }
  //* 自動スクロールの開始
  isAuto = true;
  autoEl.className = 'display-none';
  scrollTo(0, 0);

  let lyricsHtml = '';
  lyrics.forEach((lyr) => {
    lyricsHtml += `<li>${lyr}</li>`;
  });
  lyricsEl.innerHTML = lyricsHtml;
}

/** 現在の歌詞の位置へスクロール */
function scrollToLyrics() {
  //* 現在位置は「passed」クラスの最後尾
  const passedClassEls = document.getElementsByClassName('passed');
  if (passedClassEls.length === 0) return;
  const jumpTo = passedClassEls[passedClassEls.length - 1];
  const clientRect = jumpTo.getBoundingClientRect();
  const top = window.pageYOffset + clientRect.top - 300;
  window.scroll({
    top,
    behavior: 'smooth',
  });
}

//* 読み込み時にフォントカラーの選択オプションを追加
window.onload = () => {
  colorOption.forEach(color => {
    const option = document.createElement('option');
    option.value = color;
    option.innerText = color;
    option.selected = color === fontColor;

    colorEl.appendChild(option);
  });
};

//* 歌詞取得開始ボタンクリック時
startEl.addEventListener('click', () => {
  repeatGetPosition();
  countUpStart = new Date();
  countUpTime();
  startEl.className = 'display-none';
  stopEl.className = 'display';
});

//* 停止ボタンクリック時
stopEl.addEventListener('click', () => {
  clearInterval(geterId);
  clearInterval(changerId);
  clearInterval(counterId);
  startEl.className = 'display';
  stopEl.className = 'display-none';
});

//* ユーザーがスクロールした時、自動スクロールを停止
document.addEventListener('wheel', () => {
  //* タイムテーブルがない曲に対して実行しない
  if (timeArray.length !== 0) {
    isAuto = false;
    autoEl.className = 'display';
  }
});

//* AUTOボタンクリック時、自動スクロールの開始
autoEl.addEventListener('click', () => {
  isAuto = true;
  autoEl.className = 'display-none';
});

//* フォントカラー変更
colorEl.addEventListener('change', (event) => {
  const color = event.target.value;
  fontColor = color;
});