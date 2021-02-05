const NodeID3 = require('node-id3');
const { AsyncNedb } = require('nedb-async');

/** 曲クラス */
class Song {
  constructor(title, artist, album, trackNumber, path) {
    this.title = title;
    this.artist = artist;
    this.album = album;
    this.trackNumber = trackNumber && Number(trackNumber.split('/')[0]);
    this.path = `${musicPath}${path}`;
  }
}

/** プレイリストクラス */
class Playlist {
  songs = [];
  constructor(name, songs) {
    this.name = name;
    this.songs = songs;
  }
}

const autoEl = document.getElementById('auto');
const recordEl = document.getElementById('record');
const colorEl = document.getElementById('color');
const colorSelectEl = document.getElementsByClassName('color-select')[0];
const titleEl = document.getElementById('title');
const artistEl = document.getElementById('artist');
const durationEl = document.getElementById('duration');
const positionEl = document.getElementById('position');
const progressEl = document.getElementById('progress');
const prevEl = document.getElementById('prev');
const playEl = document.getElementById('play');
const nextEl = document.getElementById('next');
const audioEl = document.getElementById('audio');
const lyricsEl = document.getElementById('lyrics');
const updateMusicEl = document.getElementById('update-music');
const searchEl = document.getElementById('search-song');
const keywordEl = document.getElementById('keyword');

//* 曲の長さ
let duration = 300;
//* 歌詞の配列
let lyricsArray = [];
//* 再生時間
let currentTime = 0;
//* 再生リスト
let playArray = [];
//* 再生リスト中の現在位置
let playingIndex = 0;
//* 再生状態
let playerState = 'stop';
//* タイムテーブルの時間表（配列）
let timeArray = [];
//* 登録中の時間表
let recordedArray = [];
//* オートスクロールさせる？
let isAuto = true;
//* フォントカラー
let fontColor = 'red';
const colorOption = ['red', 'blue', 'green', 'white'];

/**
 * ウィンドウ読み込み時に登録するキーイベント
 * @param {KeyboardEvent} event 
 */
function defaultKeyEvent(event) {
  switch (event.code) {
    case 'ArrowUp':
    case 'ArrowDown':
      event.preventDefault();
      break;
    case 'ArrowLeft':
      event.preventDefault();
      backTrack();
      break;
    case 'ArrowRight':
      event.preventDefault();
      nextTrack();
      break;
    case 'Space':
      event.preventDefault();
      togglePlay();
      break;
    default:
      break;
  }
}

/**
 * タイムテーブル登録時にEnterを押すと時間が登録されるイベント
 * @param {KeyboardEvent} event 
 */
async function recordingKeyEvent(event) {
  switch (event.code) {
    //* Enterボタン押下でタイムテーブルに追加
    case 'Enter':
      const time = Math.floor(currentTime * 100) / 100;
      recordedArray.push(time);
      break;

    //* 「←」「↑」ボタン押下で一つ戻す
    case 'ArrowLeft':
    case 'ArrowUp':
      event.preventDefault()
      recordedArray.pop();
      break;

    //* 再登録の場合「↓」「→」ボタン押下で元をコピー
    case 'ArrowDown':
    case 'ArrowRight':
      event.preventDefault()
      if (timeArray.length) {
        const i = recordedArray.length;
        recordedArray.push(timeArray[i]);
      }
      break;

    case 'Space':
      event.preventDefault();
      togglePlay();
      break;
  
    default:
      break;
  }

  //* 登録が終わったら確認して保存
  if (recordedArray.length === lyricsArray.length) {
    const res = confirm('タイムテーブルを登録しますか？');
    if (res) {
      //* タイムテーブルを保存
      await restoreTimeTable();
      //* 保存したら最初から再生
      audioEl.currentTime = 0;
      //* 登録したものをそのまま用いる
      timeArray = [...recordedArray];
      scrollTo(0, 0);
    }

    recordEl.checked = false;
    //* タイムテーブル作成を停止
    quitRecord();
  }
}

/** 再生箇所の歌詞を強調表示させる */
function trackLyrics() {
  const liElements = lyricsEl.children;
  const elRows = liElements.length;
  const times = recordEl.checked ? recordedArray : timeArray;
  for (let i = 0; i < elRows; i++) {
    if (times.length || recordEl.checked) {
      //* タイムテーブルを参照し、再生時間よりも小さいものを強調表示
      liElements[i].className = times[i] && times[i] < currentTime ? `passed ${fontColor}` : '';
    } else {
      //* タイムテーブルがない場合、経過時間と曲の長さで大体のところまで
      liElements[i].className = (i < (elRows * (currentTime / duration))) ? 'passed none' : '';
    }
  }

  //* 自動スクロールがONならば
  if (isAuto) {
    scrollToLyrics();
  }
}

/** タイムテーブルを作成するメソッド */
async function restoreTimeTable() {
  const timeTable = [];
  for (let i = 0; i < recordedArray.length; i++) {
    const content = `[${recordedArray[i]}] ${lyricsArray[i]}`;
    timeTable.push(content);
  }

  const { title, artist } = playArray[playingIndex];
  const songDB = new AsyncNedb({
    filename: 'src/db/songs.db',
    autoload: true,
  });
  await songDB.asyncUpdate({ title, artist }, { $set: { timeTable } }, { multi: true });
}

/** タイムテーブル作成を中止するメソッド */
function quitRecord() {
  lyricsEl.classList.remove('recording');
  //* Enterボタン押下でタイム記録するイベント削除
  window.removeEventListener('keydown', recordingKeyEvent);
  //* デフォルトのキーイベントを復活
  window.addEventListener('keydown', defaultKeyEvent);
  recordedArray = [];
}

/** 曲が更新された時に歌詞（タイムテーブル）を取得 */
function getAndSetTrackInfo() {
  const { title, artist, path, timeTable } = playArray[playingIndex];
  audioEl.src = path;
  audioEl.play();

  titleEl.textContent = title;
  artistEl.textContent = artist;
  
  if (timeTable) {
    const timeRegex = /\[?([0-9\.]+)\] /;
    const timetables = timeTable.filter(n => n !== '').map(text => {
      const time = Number(timeRegex.exec(text)[1]);
      const lyrics = text.split('] ')[1];
      return { time, lyrics };
    });
    //* タイムテーブルが存在する時、色替え機能を開始
    //* インターバル処理多重起動の防止のため、再起動
    timeArray = timetables.map(n => n.time);
    lyricsArray = timetables.map(n => n.lyrics);
  } else {
    timeArray = [];
    //* ID3タグから歌詞を取得
    lyricsArray = getLyricsFromPath(path);
  }
  recordEl.disabled = lyricsArray.length === 0;
  //* 自動スクロールの開始
  isAuto = true;
  autoEl.className = 'display-none';
  scrollTo(0, 0);

  let lyricsHtml = '';
  lyricsArray.forEach((lyr) => {
    lyricsHtml += `<li>${lyr}</li>`;
  });
  lyricsEl.innerHTML = lyricsHtml;
}

/**
 * 曲のパスからID3タグの歌詞を取得するメソッド
 * @param {string} path 曲のファイルパス
 * @return {string[]} 歌詞の配列
 */
function getLyricsFromPath(path) {
  const id3Tag = NodeID3.read(path);
  const lyrics = id3Tag.unsynchronisedLyrics && id3Tag.unsynchronisedLyrics.text;
  return lyrics ? lyrics.split(/\r\n|\n|\r/) : [];
}

/** 現在の歌詞の位置へスクロール */
function scrollToLyrics() {
  //* 現在位置は「passed」クラスの最後尾
  const passedClassEls = document.getElementsByClassName('passed');
  if (passedClassEls.length === 0) return;
  const jumpTo = passedClassEls[passedClassEls.length - 1];
  const clientRect = jumpTo.getBoundingClientRect();
  const windowHeight = window.innerHeight;
  const top = window.pageYOffset + clientRect.top - ((windowHeight + 100) / 2);
  window.scroll({
    top,
    behavior: 'smooth',
  });
}

/**
 * iTunesの曲情報を更新するメソッド。Musicフォルダを選択し、InputEventで配列を取得
 * @param {InputEvent} event InputEvent
 */
async function updateSongList(event) {
  //* iTunesの曲が存在しているフォルダパス
  const musicPath = '/Users/shiozawatakuto/Music/iTunes/iTunes Media/';
  //* 曲情報データベースを取得
  const db = new AsyncNedb({
    filename: 'src/db/songs.db',
    autoload: true,
  });  
  //* 返ってきた曲を配列で取得し、それぞれ処理
  const f = event.target.files;
  for (let i = 0; i < f.length; i++) {
    //* オーディオファイルでない場合飛ばす
    if (f[i].type.indexOf('audio') === -1) continue;

    //* 相対パスの取得
    const rPath = f[i].webkitRelativePath;
    //* node-id3によって, mp3のID3タグ情報を取得
    const { title, artist, album, trackNumber } = NodeID3.read(musicPath + rPath);
    //* なぜかタイトルが取得できない曲があるため、ファイル名からタイトルを取得
    const subTitle = rPath.split('/').pop().split('.')[0];
    console.log(title || subTitle);
    //* Songクラスを新規作成
    const song = new Song(title || subTitle, artist, album, trackNumber, rPath);
    //* 曲情報をUPSERTする
    await db.asyncUpdate({ title, artist }, song, { upsert: true });
  }  
}

/** 曲の検索（空白区切のAND検索、[曲名, アーティスト名, アルバム名]） */
async function searchSongs() {
  //* キーワードを空白で区切る
  const words = keywordEl.value.split(/[ 　]/);
  if (words.length === 0) return;

  //* キーワードから曲を検索
  //* 曲情報データベースを取得
  const songDB = new AsyncNedb({
    filename: 'src/db/songs.db',
    autoload: true,
  });

  //* キーワード毎に正規表現（部分一致）化する
  const regs = words.map(word => new RegExp(word));
  //* 検索カラム
  const songColumn = ['title', 'artist', 'album'];
  //* 検索ワードに対してAND検索、カラムに対してOR検索
  const andQuery = regs.map(regex => {
    const orQuery = songColumn.map(col => ({ [col]: regex }));
    return { $or: orQuery };
  });

  //* データベース内をクエリに従って検索・表示
  const songs = await songDB.asyncFind({ $and: andQuery });
  if (!songs.length) return;

  const songIds = songs.map(song => song._id);

  //* 検索された曲を含むプレイリストを検索
  //* プレイリストデータベースを取得
  const playlistDB = new AsyncNedb({
    filename: 'src/db/playlists.db',
    autoload: true,
  });

  //* 曲IDを含むプレイリストを取得
  const playlists = await playlistDB.asyncFind({ songs: { $elemMatch: { _id: { $in: songIds } } } });
  console.log(playlists);
}

/**
 * 秒数を時刻（MM:SS）にフォーマットするメソッド
 * @param {number} time 時間（秒）
 * @return {string} 時刻（MM:SS）
 */
function convertTime(time) {
  return Math.floor(time / 60) + ':' + ('0' + Math.floor(time % 60)).slice(-2);
}

/** 再生状態をスイッチするメソッド */
function togglePlay() {
  //* 停止中の場合、「再生」
  if (playerState === 'pause') {
    audioEl.play();
  }
  //* 再生中の場合、「停止」
  if (playerState === 'playing') {
    audioEl.pause();
  }
}

/** 前曲へ */
function backTrack() {
  if (playerState === 'stop' || !playArray.length) return;
  if (audioEl.currentTime > 3) {
    audioEl.currentTime = 0;
    return;
  }
  playingIndex = Math.max(playingIndex - 1, 0);
  getAndSetTrackInfo();
}

/** 次曲へ */
function nextTrack() {
  if (playerState === 'stop' || !playArray.length) return;
  playingIndex =
    playArray.length === playingIndex + 1
      ? 0
      : playingIndex + 1;
  getAndSetTrackInfo();
}

//* アプリ読み込み時に
window.onload = async () => {
  //* フォントカラーの選択オプションを追加
  colorOption.forEach(color => {
    const option = document.createElement('option');
    option.value = color;
    option.innerText = color;
    option.selected = color === fontColor;

    colorEl.appendChild(option);
  });

  //* デフォルトのキーイベントを設定
  window.addEventListener('keydown', defaultKeyEvent);
};

//* ユーザーがスクロールした時、自動スクロールを停止
document.addEventListener('wheel', () => {
  isAuto = false;
  autoEl.className = 'display';
});

//* AUTOボタンクリック時、自動スクロールの開始
autoEl.addEventListener('click', () => {
  autoEl.blur();
  isAuto = true;
  autoEl.className = 'display-none';
});

//* 「(再)登録」「登録中止」ボタンクリック時
recordEl.addEventListener('change', (event) => {
  recordEl.blur();
  if (event.target.checked) {
    lyricsEl.classList.add('recording');
    //* 曲を最初から再生し始める
    audioEl.currentTime = 0;
    //* デフォルトのキーイベントを削除
    window.removeEventListener('keydown', defaultKeyEvent);
    //* Enterボタン押下でタイム記録するイベント追加
    window.addEventListener('keydown', recordingKeyEvent);
  } else {
    //* タイムテーブル登録を中止
    quitRecord();
  }
});

//* フォントカラー変更
colorEl.addEventListener('change', (event) => {
  colorEl.blur();
  const color = event.target.value;
  colorSelectEl.className = 'color-select ' + color;
  fontColor = color;
});

//* プログレスバーを操作中
progressEl.addEventListener('input', (event) => {
  if (playerState === 'playing') {
    audioEl.pause();
  }
  const time = event.target.value;
  positionEl.textContent = convertTime(time);
  audioEl.currentTime = time;
});

//* プログレスバー操作終了時
progressEl.addEventListener('change', () => {
  audioEl.play();
  progressEl.blur();
});

//* 曲情報をアップデート
updateMusicEl.addEventListener('input', updateSongList);

//* 曲の検索
searchEl.addEventListener('click', searchSongs);

//* 再生/停止ボタンクリック
playEl.addEventListener('click', async () => {
  //* 再生リストが空の時
  if (!playArray.length) {
    const songDB = new AsyncNedb({
      filename: 'src/db/songs.db',
      autoload: true,
    });
    //* 適当に曲を取ってきて再生リストに格納・再生
    playArray = await songDB.asyncFind({ title: /[abc]/ });
    getAndSetTrackInfo();

    prevEl.disabled = false;
    nextEl.disabled = false;
  }

  //* 再生状態トグル
  togglePlay();
  playEl.blur();
});

//* 「前へ」ボタン
prevEl.addEventListener('click', () => {
  backTrack();
  prevEl.blur();
});

//* 「次へ」ボタン
nextEl.addEventListener('click', () => {
  nextTrack();
  nextEl.blur();
});

//* 一時停止した時
audioEl.addEventListener('pause', () => {
  playerState = 'pause';
  playEl.innerHTML = '<i class="icon-control-play"></i>';
});

//* 再生した時
audioEl.addEventListener('play', () => {
  playerState = 'playing';
  playEl.innerHTML = '<i class="icon-control-pause"></i>';
});

//* 曲が最後まで行った時
audioEl.addEventListener('ended', nextTrack);

//* 曲が読み込まれた時、再生時間を更新
audioEl.addEventListener('loadeddata', () => {
  duration = audioEl.duration;
  durationEl.textContent = convertTime(duration);
  progressEl.max = Math.floor(duration);
});

//* 現在の再生位置が変更された時
audioEl.addEventListener('timeupdate', () => {
  currentTime = audioEl.currentTime;
  progressEl.value = currentTime;
  positionEl.textContent = convertTime(currentTime);
  trackLyrics();
});
