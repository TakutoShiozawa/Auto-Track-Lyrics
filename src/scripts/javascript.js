const Path = require('path');
const NodeID3 = require('node-id3');
const { AsyncNedb } = require('nedb-async');
const Remote = require('electron').remote;

/** 曲クラス */
class Song {
  constructor({ _id, title, artist, album, trackNumber, path, timeTable }) {
    this._id = _id;
    this._title = title;
    this._artist = artist;
    this._album = album;
    this._trackNumber = trackNumber;
    this._path = path;
    this._timeTable = timeTable;
  }

  //* Getter
  get title() { return this._title; }
  get artist() { return this._artist; }
  get album() { return this._album; }
  get trackNumber() { return this._trackNumber; }
  get path() { return this._path; }
  get timeTable() { return this._timeTable; }
  get artwork() {
    return this.translateBuffer2Binary();
  }
  get lyrics() {
    return this.getLyrics();
  }

  /** 曲のアートワークを取得するメソッド */
  translateBuffer2Binary() {
    //* 曲のID3タグを取得
    const id3tag = NodeID3.read(this.path);
    //* アートワークを取得できない場合, No Image
    if (!id3tag.image || !id3tag.image.imageBuffer) return 'images/no-image.jpg';

    //* Bufferをバイナリに変換
    const buffer = id3tag.image.imageBuffer;
    let binaryData = '';
    for (let i = 0; i < buffer.length; i++) {
      binaryData += String.fromCharCode(buffer[i]);
    }
    return 'data:image/jpeg;base64,' + window.btoa(binaryData);
  }

  /** 曲のID3タグの歌詞を取得するメソッド */
  getLyrics() {
    const id3Tag = NodeID3.read(this.path);
    const lyricsText = id3Tag.unsynchronisedLyrics && id3Tag.unsynchronisedLyrics.text;
    return lyricsText ? lyricsText.split(/\r\n|\n|\r/) : [];
  }

  //* Setter的メソッド
  /** `Song`クラスのSetter関数 */
  async updateSongData(payload) {
    //* アップデートを許可するキー
    const allowedKeys = ['title', 'artist', 'album', 'trackNumber', 'path', 'timeTable'];
    Object.keys(payload).forEach(key => {
      //* キーが許可されてない時、削除
      if (allowedKeys.indexOf(key) === -1) {
        delete payload[key];
        return;
      }
      this[`_${key}`] = payload[key];
    });

    //* 曲情報データベースを取得
    const db = new AsyncNedb({
      filename: Path.join(__dirname, 'db/songs.db'),
      autoload: true,
    });
    await db.asyncUpdate({ _id: this._id }, { $set: payload });
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
//! -----------------------------
//! 再生したい曲のキーワード

const searchWord = 'まふまふ';
//! -----------------------------

//* ヘッダーの高さ, かつ, 最小ウィンドウサイズ
const HEADER_HEIGHT = 100;
//* タブの高さ
const TABS_HEIGHT = 38;
//* ウィンドウの歌詞が見える最小の高さ
const MINIMUM_SIZE_FOR_LYRICS = 196;

const closeEl = document.getElementById('close');
const shuffleEl = document.getElementById('shuffle');
const repeatEl = document.getElementById('repeat');
const positionEl = document.getElementById('position');
const progressEl = document.getElementById('progress');
const durationEl = document.getElementById('duration');
const titleEl = document.getElementById('title');
const artistEl = document.getElementById('artist');
const recordEl = document.getElementById('record');
const prevEl = document.getElementById('prev');
const playEl = document.getElementById('play');
const nextEl = document.getElementById('next');
const volumeEl = document.getElementById('volume');
const volumeIconEl = document.getElementById('volume-icon');
const colorEl = document.getElementById('color');
const colorSelectEl = document.getElementsByClassName('color-select')[0];
const snapEl = document.getElementById('snap');
const playArrayEl = document.getElementById('play-array');
const lyricsEl = document.getElementById('lyrics');
const candidateEl = document.getElementById('candidate');
const checkedEl = document.getElementById('checked');
const autoEl = document.getElementById('auto');
const audioEl = document.getElementById('audio');
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
let shuffledPlayArray = [];
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
//* シャッフルON?
let isShuffle = false;
//* リピートON?
let isRepeat = false;
//* フォントカラー
let fontColor = 'red';
const colorOption = ['red', 'blue', 'green', 'white'];
//* Snap.js操作用の変数, 初期設定
let snapper = new Snap({ element: snapEl });
/**
 * ウィンドウ読み込み時に登録するキーイベント
 * @param {KeyboardEvent} event 
 */
async function defaultKeyEvent(event) {
  switch (event.code) {
    case 'ArrowUp':
      event.preventDefault();
      volumeUp();
      break;
    case 'ArrowDown':
      event.preventDefault();
      volumeDown();
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
      await togglePlay();
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
      await togglePlay();
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
      lyricsEl.scroll({ top: 0 });
    }

    //* タイムテーブル作成を停止
    quitRecord();
    recordEl.checked = false;
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

  await playingSong().updateSongData({ timeTable });
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
  const song = playingSong();
  audioEl.src = song.path;
  audioEl.play();

  titleEl.textContent = song.title;
  artistEl.textContent = song.artist;
  
  if (song.timeTable) {
    const timeRegex = /\[?([0-9\.]+)\] /;
    const splitted = song.timeTable.filter(n => n !== '').map(text => {
      const time = Number(timeRegex.exec(text)[1]);
      const lyrics = text.split('] ')[1];
      return { time, lyrics };
    });
    //* タイムテーブルが存在する時、色替え機能を開始
    //* インターバル処理多重起動の防止のため、再起動
    timeArray = splitted.map(n => n.time);
    lyricsArray = splitted.map(n => n.lyrics);
  } else {
    timeArray = [];
    //* ID3タグから歌詞を取得
    lyricsArray = song.lyrics;
  }
  recordEl.disabled = lyricsArray.length === 0;
  //* 自動スクロールの開始
  isAuto = true;
  autoEl.className = 'display-none';
  lyricsEl.scroll({ top: 0 });

  let lyricsHtml = '';
  lyricsArray.forEach((lyr) => {
    lyricsHtml += `<li>${lyr}</li>`;
  });
  lyricsEl.innerHTML = lyricsHtml;
}

//* 誤差の補正
const CORRECTION = 12;
/** 現在の歌詞の位置へスクロール */
function scrollToLyrics() {
  //* 現在位置は「passed」クラスの最後尾
  const passedClassEls = document.getElementsByClassName('passed');
  if (passedClassEls.length === 0) return;
  const jumpTo = passedClassEls[passedClassEls.length - 1];
  const clientRect = jumpTo.getBoundingClientRect();
  const top = clientRect.top + lyricsEl.scrollTop - ((window.innerHeight + HEADER_HEIGHT + TABS_HEIGHT) / 2) + CORRECTION;
  lyricsEl.scroll({
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
    filename: Path.join(__dirname, 'db/songs.db'),
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

/**
 * 曲の検索（空白区切のAND検索、[曲名, アーティスト名, アルバム名]）
 * @return {Song[]} 
 */
async function searchSongs(text) {
  //* キーワードを空白で区切る
  // const words = keywordEl.value.split(/[ 　]/);
  const words = text.split(/[ 　]/);
  if (words.length === 0) return;

  //* キーワードから曲を検索
  //* 曲情報データベースを取得
  const songDB = new AsyncNedb({
    filename: Path.join(__dirname, 'db/songs.db'),
    autoload: true,
  });

  //* キーワード毎に正規表現（部分一致）化する
  const regs = words.map(word => new RegExp(word, 'i'));
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

  // const songIds = songs.map(song => song._id);

  //* 検索された曲を含むプレイリストを検索
  //* プレイリストデータベースを取得
  // const playlistDB = new AsyncNedb({
  //   filename: Path.join(__dirname, 'db/playlists.db'),
  //   autoload: true,
  // });

  //* 曲IDを含むプレイリストを取得
  // const playlists = await playlistDB.asyncFind({ songs: { $elemMatch: { _id: { $in: songIds } } } });
  // console.log(playlists);
  const songCls = songs.map(song => new Song(song));
  return songCls;
}

/**
 * 秒数を時刻`MM:SS`にフォーマットするメソッド
 * @param {number} time 時間（秒）
 * @return {string} 時刻 `MM:SS`
 */
function convertTime(time) {
  return Math.floor(time / 60) + ':' + ('0' + Math.floor(time % 60)).slice(-2);
}

/** ボリュームを上げる */
function volumeUp() {
  if (playerState === 'stop' || !playArray.length) return;
  audioEl.volume = Math.min(audioEl.volume + 0.1, 1);
}

/** ボリュームを下げる */
function volumeDown() {
  if (playerState === 'stop' || !playArray.length) return;
  audioEl.volume = Math.max(audioEl.volume - 0.1, 0);
}

/** 前曲へ */
function backTrack() {
  if (playerState === 'stop' || !playArray.length) return;
  //* 再生時間が３秒以上経過していたら曲の最初へ
  if (currentTime > 3 || playArray.length === 1) {
    audioEl.currentTime = 0;
    return;
  }
  playingIndex = playingIndex ? playingIndex - 1 : playArray.length - 1;
  const elem = createSongElement(playingSong());
  playArrayEl.prepend(elem);

  getAndSetTrackInfo();
}

/** 次曲へ */
function nextTrack() {
  if (playerState === 'stop' || !playArray.length) return;
  //* 再生リストの最後まで行ったら0から
  if (playArrayEl.childElementCount === 1) {
    playingIndex = 0;
    //* シャッフル機能がONの場合、再びシャッフルを行う
    const array = isShuffle ? (shufflePlayArray() || shuffledPlayArray) : playArray;
    setArrayToList(playArrayEl, array);
  } else {
    playArrayEl.removeChild(playArrayEl.firstElementChild);
    playingIndex =
      playArray.length - 1 === playingIndex
        ? 0
        : playingIndex + 1;
  }

  getAndSetTrackInfo();
}

/** 再生状態をスイッチするメソッド */
async function togglePlay() {
  //* 再生リストが空の時
  if (!playArray.length) {
    await setPlayArray();

    prevEl.disabled = false;
    nextEl.disabled = false;
  }

  //* 停止中の場合、「再生」
  if (playerState === 'pause') {
    audioEl.play();
  }
  //* 再生中の場合、「停止」
  if (playerState === 'playing') {
    audioEl.pause();
  }
}

/** 再生リストを取得するメソッド */
async function setPlayArray() {
  playingIndex = 0;
  //* 適当に曲を取ってきて再生リストに格納・再生
  //TODO: 再生リストの取得方法を決定する
  playArray = await searchSongs(searchWord);
  //* シャッフルしたリストを同時に作成
  shufflePlayArray(true);
  //* 再生リストを表示させる
  setArrayToList(playArrayEl, isShuffle ? shuffledPlayArray : playArray);

  getAndSetTrackInfo();
}

/**
 * 対象の要素がスクロールにより表示された時にメソッドが実行されるように設定するメソッド
 * @param {HTMLElement} target スクロール監視対象の要素
 * @param {HTMLElement} elem 表示監視対象の要素
 * @param {Function} callback 対象の要素が表示された時に実行する関数
 */
function delayLoad(target, elem, callback) {
  const checkVisibility = function() {
    /** 表示領域の下端の位置 */
    const scrollBottom = target.scrollTop + target.clientHeight;
    /** 要素の上端の位置 */
    const elemTop = elem.offsetTop - target.offsetTop;

    //* 要素が表示された時
    if( elemTop < scrollBottom ) {
      //* イベントハンドラを削除する
      target.removeEventListener('scroll', checkVisibility);
      //* コールバックを呼び出す
      callback(elem);
    }
  }

  //* scrollに応答して要素の状態を調べるように、ハンドラを登録する
  target.addEventListener('scroll', checkVisibility);

  //* ドキュメントの構築を待ってから初期化する
  window.setTimeout(checkVisibility, 0);
}

/**
 * リストを表示させるメソッド
 * @param {HTMLElement} target リスト表示させる要素
 * @param {Song[]} array 表示させたい曲のリスト
 */
function setArrayToList(target, array) {
  /** ul要素に挿入するli要素の配列 */
  const addList = [];
  //* 曲ごとにli要素を作成、データ挿入
  for (let i = 0, len = array.length; i < len; i++) {
    const elem = createSongElement(array[i]);

    //* 表示された時にアートワークを読み込むイベントハンドラを設定
    delayLoad(target, elem, function(el) {
      const imgEl = el.querySelector('img');
      imgEl.src = array[i].artwork;
    });
    addList.push(elem);
  }
  //* リストに格納
  target.append(...addList);
}

/**
 * 曲のli要素を作成するメソッド
 * @param {Song} song 曲オブジェクト
 */
function createSongElement(song) {
  const elem = document.createElement('li');
  const img = document.createElement('img');
  const title = document.createElement('span');
  const artist = document.createElement('span');

  title.textContent = song.title;
  artist.textContent = song.artist;
  elem.append(img, title, artist);
  return elem;
}

/**
 * リサイズが完了した場合にのみ、引数の関数を実行するメソッド
 * @param {Function} func リサイズ完了後に実行したい関数
 */
function completedFunction(func) {
  let timer;
  return function() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(func, 100);
  };
}

/**
 * 再生リストをシャッフルするメソッド
 * @param {boolean} isAll 全曲シャッフルを行うか
 */
function shufflePlayArray(isAll = true) {
  const array = [...playArray];
  //* 再生中の曲を配列から除く
  const first = isAll ? [] : array.splice(playingIndex, 1);
  //* ランダム配置
  for (let i = array.length - 1; i >= 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  //* 再生中の曲を先頭に配置
  shuffledPlayArray = [...first, ...array];
  playingIndex = 0;
}

/** 再生リストをもとに戻す */
function undoPlayArray() {
  const id = playingSong()._id;
  //* 再生中のインデックスを再入手
  playingIndex = playArray.findIndex(song => song._id === id);
}

/**
 * 現在再生している曲を取得するメソッド
 * @return {Song}
 */
function playingSong() {
  const array = isShuffle ? shuffledPlayArray : playArray;
  return array[playingIndex];
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

  //* 初期音量設定
  volumeEl.value = audioEl.volume;

  //* デフォルトのキーイベントを設定
  window.addEventListener('keydown', defaultKeyEvent);

  //TODO: テスト
  const songDB = new AsyncNedb({
    filename: Path.join(__dirname, 'db/songs.db'),
    autoload: true,
  });
  const songs = await songDB.asyncFind({}, [['sort', { title: -1 }], ['limit', 100]]);
  setArrayToList(candidateEl, songs.map(song => new Song(song)));
  //TODO: ここまで
};

const leftMenuEl = document.getElementById('left-menu');
const rightMenuEl = document.getElementById('right-menu');

//* ウィンドウがリサイズが完了（と判定）した時
window.addEventListener('resize', completedFunction(() => {
  //* 現在のウィンドウサイズを取得
  const win = Remote.getCurrentWindow();
  const [width, height] = win.getSize();

  //* Snap.jsを操作
  const half = width / 2;
  snapper.settings({
    maxPosition: half,
    minPosition: - half,
  });
  //* Snap.jsに影響するスタイルを更新
  leftMenuEl.style.paddingRight = (width - half) + 'px';
  rightMenuEl.style.paddingLeft = (width - half) + 'px';

  //* 中途半端な高さを弾く
  if (height < (MINIMUM_SIZE_FOR_LYRICS + HEADER_HEIGHT) / 2) {
    win.setBounds({ height: HEADER_HEIGHT });
  } else if (height < MINIMUM_SIZE_FOR_LYRICS) {
    win.setBounds({ height: MINIMUM_SIZE_FOR_LYRICS });
  }
}));

//* ウィンドウをリサイズした時
window.addEventListener('resize', () => snapper.close());

//* 閉じるボタン
closeEl.onclick = () => {
  Remote.getCurrentWindow().close();
};

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
    lyricsEl.scroll({ top: 0 });
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
// updateMusicEl.addEventListener('input', updateSongList);

//* 曲の検索
// searchEl.addEventListener('click', searchSongs);

//* 再生/停止ボタンクリック
playEl.addEventListener('click', async () => {
  //* 再生状態トグル
  await togglePlay();
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

//* 音量つまみの操作中の時
volumeEl.addEventListener('input', (event) => {
  audioEl.volume = event.target.value;
});

//* 音量つまみの操作終了時
volumeEl.addEventListener('change', () => volumeEl.blur());

//* 歌詞をスクロールした時、自動スクロールを停止
lyricsEl.addEventListener('wheel', () => {
  isAuto = false;
  autoEl.className = 'display';
});

//* 曲リストをスクロールした時
candidateEl.addEventListener('scroll', () => {
  const elems = candidateEl.childNodes;
});

//* シャッフルボタン
shuffleEl.addEventListener('change', (event) => {
  isShuffle = event.target.checked;
  if (isShuffle) {
    //* 再生リストをもとにシャッフルする
    shufflePlayArray(false);
    setArrayToList(playArrayEl, shuffledPlayArray);
  } else {
    //* もとの再生リストの順番で再生する
    undoPlayArray();
    setArrayToList(playArrayEl, playArray.slice(playingIndex));
  }
});

//* リピートボタン, 変数を更新するのみ
repeatEl.addEventListener('change', (event) => isRepeat = event.target.checked);

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
audioEl.addEventListener('ended', () => {
  //* リピートがONの場合
  if (isRepeat) {
    audioEl.currentTime = 0;
    lyricsEl.scroll({ top: 0 });
    audioEl.play();
    return;
  }
  nextTrack();
});

//* 曲が読み込まれた時、再生時間を更新
audioEl.addEventListener('loadeddata', () => {
  duration = audioEl.duration;
  durationEl.textContent = convertTime(duration);
  progressEl.max = Math.floor(duration);
  progressEl.disabled = false;
});

//* 現在の再生位置が変更された時
audioEl.addEventListener('timeupdate', () => {
  currentTime = audioEl.currentTime;
  progressEl.value = currentTime;
  positionEl.textContent = convertTime(currentTime);
  trackLyrics();
});

//* 音量が変更された時
audioEl.addEventListener('volumechange', () => {
  const volume = audioEl.volume;
  volumeEl.value = volume;
  volumeIconEl.className =
    (volume > 0.5 && 'icon-volume-2') ||
    (volume > 0 && 'icon-volume-1') ||
    'icon-volume-off';
});

//* サムネイル表示テスト
const imageEl = document.getElementById('image');
const imageTestEl = document.getElementById('image-test');
imageTestEl.addEventListener('click', () => {
  imageEl.src = playingSong().artwork;
});
