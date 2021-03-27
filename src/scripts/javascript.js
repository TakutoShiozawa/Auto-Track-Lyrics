const Path = require('path');
const NodeID3 = require('node-id3');
const { AsyncNedb } = require('nedb-async');
const Remote = require('electron').remote;
const { Sortable } = require('@shopify/draggable');

/** 曲クラス */
class Song {
  constructor({ _id, title, artist, album, trackNumber, path, timeTable }) {
    /** @type {string} */
    this._id = _id;
    /** @type {string} */
    this._title = title;
    /** @type {string} */
    this._artist = artist;
    /** @type {string} */
    this._album = album;
    /** @type {number} */
    this._trackNumber = trackNumber;
    /** @type {string} */
    this._path = path;
    /** @type {string[]} */
    this._timeTable = timeTable && timeTable.filter(n => n !== '');
    //* 以下、再生時に整形
    /** @type {number[]} */
    this._timeArray = [];
    /** @type {string[]} */
    this._lyricsArray = [];
  }

  //* Getter関数
  get title() { return this._title; }
  get artist() { return this._artist; }
  get album() { return this._album; }
  get trackNumber() { return this._trackNumber; }
  get path() { return this._path; }
  get timeTable() { return this._timeArray; }
  get lyrics() { return this._lyricsArray; }
  get index() {
    return playingArray().findIndex(song => song._id === this._id);
  }

  /** 曲のアートワークを取得するメソッド */
  displayArtwork(imgElem) {
    //* Workerを作成
    const worker = new Worker('scripts/worker.js');
    //* Workerから値が返ってきたらimg要素に入れる
    worker.addEventListener('message', ({ data }) => {
      imgElem.src = 'data:image/jpeg;base64,' + window.btoa(data);
    });
    //* 曲のID3タグを取得
    const id3tag = NodeID3.read(this.path);
    //* アートワークを取得できない場合, No Image
    if (!id3tag.image || !id3tag.image.imageBuffer) {
      imgElem.src = 'images/no-image.jpg';
      return;
    };
    //* Web WorkerでBufferをバイナリに変換
    worker.postMessage(id3tag.image.imageBuffer);
  }

  /** 曲のID3タグの歌詞を取得するメソッド */
  getLyricsfromID3() {
    const id3Tag = NodeID3.read(this.path);
    const lyricsText = id3Tag.unsynchronisedLyrics && id3Tag.unsynchronisedLyrics.text;
    return lyricsText ? lyricsText.split(/\r\n|\n|\r/) : [];
  }

  //* Setter的関数
  /** `Song`クラスのSetter関数 */
  async updateSongData(payload) {
    //* アップデートを許可するキー
    const allowedKeys = ['title', 'artist', 'album', 'trackNumber', 'path'];
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

  /** タイムテーブルを更新する関数 */
  async updateTimeTable(timeArray) {
    const timeTable = timeArray.map((time, i) => `[${time}] ${this._lyricsArray[i]}`);
    //* 曲情報データベースを取得
    const db = new AsyncNedb({
      filename: Path.join(__dirname, 'db/songs.db'),
      autoload: true,
    });
    await db.asyncUpdate({ _id: this._id }, { $set: { timeTable } });
    this._timeArray = timeArray;
    this._timeTable = timeTable;
  }

  /** 再生時に歌詞・タイムテーブルを取得 */
  setLyrics() {
    if (!this._lyricsArray.length) {
      if (this._timeTable) {
        /** タイムテーブルから時間を取得する正規表現 */
        const timeRegex = /\[?([0-9\.]+)\] /;
        this._timeArray = this._timeTable.map(text => Number(timeRegex.exec(text)[1]));
        this._lyricsArray = this._timeTable.map(text => text.split('] ')[1]);
      } else {
        //* ID3タグから歌詞を取得
        this._lyricsArray = this.getLyricsfromID3();
      }
    }
  }
}

/** プレイリストクラス */
class Playlist {
  songIds = [];
  constructor({ _id, name, songIds }) {
    /** @type {string} */
    this._id = _id;
    /** @type {string} */
    this._name = name;
    /** @type {string[]} */
    this._songIds = songIds;
    /** @type {Song[]} */
    this._songs = [];
  }

  //* Getter関数
  get name() { return this._name; }
  get count() { return this._songs.length || this._songIds.length; }
  //* Getter的関数
  async songs() {
    if (!this._songs || !this._songs.length) {
      await this.fetchSongsByIds(this._songIds);
    }
    return this._songs;
  }
  
  /**
   * IDから曲の情報を取得するメソッド
   * @param {string[]} ids 曲IDの配列
   * @return {Promise<void>}
   */
  async fetchSongsByIds(ids) {
    if (!ids || !ids.length) return [];
    const songDB = new AsyncNedb({
      filename: Path.join(__dirname, 'db/songs.db'),
      autoload: true,
    });
    const foundSongs = await songDB.asyncFind({ _id: { $in: ids } });
    this._songs = this._songIds.map(id => {
      const song = foundSongs.find(s => s._id === id);
      return song && new Song(song);
    });
  }

  //* Setter的関数
  /** `Playlist`クラスのSetter関数 */
  async updatePlaylistData(payload) {
    //* アップデートを許可するキー
    const allowedKeys = ['name', 'songIds', 'latestPlayedAt'];
    Object.keys(payload).forEach(key => {
      //* キーが許可されてない時、削除
      if (allowedKeys.indexOf(key) === -1) {
        delete payload[key];
        return;
      }
      this[`_${key}`] = payload[key];
    });
    payload.updatedAt = new Date();

    //* 曲情報データベースを取得
    const db = new AsyncNedb({
      filename: Path.join(__dirname, 'db/playlists.db'),
      autoload: true,
    });
    await db.asyncUpdate({ _id: this._id }, { $set: payload });
  }

  /** プレイリストの順番を入れ替える関数 */
  async changeSongList(payload) {
    if (!Array.isArray(payload)) return;

    this._songs = payload;
    const songIds = payload.map(song => song._id);
    await this.updatePlaylistData({ songIds });
  }
}

/** ヘッダーの高さ, かつ, 最小ウィンドウサイズ */
const HEADER_HEIGHT = 100;
/** タブの高さ */
const TABS_HEIGHT = 38;
/** ウィンドウの歌詞が見える最小の高さ */
const MINIMUM_SIZE_FOR_LYRICS = 196;

//* ボタン
const closeEl       = document.getElementById('close');
const prevEl        = document.getElementById('prev');
const playEl        = document.getElementById('play');
const nextEl        = document.getElementById('next');
const cancelEditEl  = document.getElementById('cancel-edit');
const compEditEl    = document.getElementById('complete-edit');
const prevPageEl    = document.getElementById('p-prev');
const nextPageEl    = document.getElementById('p-next');
const jumpEl        = document.getElementById('jump');
const autoEl        = document.getElementById('auto');
//* Input要素
const shuffleEl     = document.getElementById('shuffle');
const repeatEl      = document.getElementById('repeat');
const progressEl    = document.getElementById('progress');
const recordEl      = document.getElementById('record');
const volumeEl      = document.getElementById('volume');
const searchEl      = document.getElementById('search');
//* タブ
const radioChecked  = document.getElementById('checked-radio');
const radioCndd     = document.getElementById('candidate-radio');
const radioPlayArr  = document.getElementById('play-array-radio');
const radioLyrics   = document.getElementById('lyrics-radio');
//* その他特殊
const colorEl       = document.getElementById('color');
const colorSelectEl = document.getElementsByClassName('color-select')[0];
const audioEl       = document.getElementById('audio');
// const updateMusicEl = document.getElementById('update-music');
//* テキスト
const positionEl    = document.getElementById('position');
const durationEl    = document.getElementById('duration');
const titleEl       = document.getElementById('title');
const artistEl      = document.getElementById('artist');
const currentPageEl = document.getElementById('current-page');
const totalPageEl   = document.getElementById('total-page');
//* リスト
const playArrayEl   = document.getElementById('play-array');
const lyricsEl      = document.getElementById('lyrics');
const candidateEl   = document.getElementById('candidate');
const checkedEl     = document.getElementById('checked');
const playlistsEl   = document.getElementById('playlists');
const newPlaylistEl = document.getElementById('new-playlist');
//* その他
const volumeIconEl  = document.getElementById('volume-icon');
const snapEl        = document.getElementById('snap');
const leftMenuEl    = document.getElementById('left-menu');
const rightMenuEl   = document.getElementById('right-menu');
//* ダイアログ
/** @type {HTMLDialogElement} */
const dialogEl      = document.getElementById('dialog');
const dlgInputEl    = document.getElementById('dialog-input');
const dlgCancelEl   = document.getElementById('dialog-cancel');
const dlgSubmitEl   = document.getElementById('dialog-submit');

/** 曲の長さ */
let duration = 300;
/** 再生時間 */
let currentTime = 0;
/** @type {Array<Song>} 再生リスト */
let playArray = [];
/** @type {Array<Song>} シャッフルされた再生リスト */
let shuffledPlayArray = [];
/** @type {Array<Song>} 選択された再生リスト */
let checkedArray = [];
/** @type {Playlist[]} プレイリスト一覧 */
let playlistArray = [];
/** 再生リスト中の現在位置 */
let playingIndex = 0;
/** 再生状態 */
let playerState = 'stop';
/** @type {Array<number>} 登録中の時間表 */
let recordedArray = [];
/** 歌詞ジャンプ機能をON? */
let isJumping = false;
/** オートスクロールさせる？ */
let isAuto = true;
/** シャッフルON? */
let isShuffle = false;
/** リピートON? */
let isRepeat = false;
/** 戻り曲数 */
let backCount = 0;
/** フォントカラー */
let fontColor = 'red';
/** フォントカラーオプション */
const ColorEnum = ['red', 'blue', 'green', 'white'];
/** Snap.js操作用の変数, 初期設定 */
const snapper = new Snap({
    element: snapEl,
    touchToDrag: false,
  });
/** Draggable.jsのドラッグ可能領域 */
const sortable = new Sortable(playArrayEl, { draggable: 'li' });

/**
 * 現在再生している再生リストを返すメソッド
 * @return {Song[]}
 */
function playingArray() {
  return isShuffle ? shuffledPlayArray : playArray;
}

/**
 * 現在再生している曲を取得するメソッド
 * @return {Song}
 */ 
function playingSong() {
  return playingArray()[playingIndex];
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
  if (
    playerState === 'stop'||
    playerState === 'loading' ||
    !playArray.length
  ) return;
  
  //* 再生時間が３秒以上経過していたら曲の最初へ
  if (currentTime > 3 || playArray.length === 1) {
    audioEl.currentTime = 0;
    return;
  }

  backCount++;
  playingIndex = playingIndex ? playingIndex - 1 : playArray.length - 1;
  getAndSetTrackInfo();
}

/** 次曲へ */
function nextTrack() {
  if (
    playerState === 'stop'||
    playerState === 'loading' ||
    !playArray.length
  ) return;
  
  //* 再生リストの最後まで行ったら0から
  if (playArray.length - 1 === playingIndex) {
    playingIndex = 0;
    //* シャッフル機能がONの場合、再びシャッフルを行う
    if (isShuffle && !backCount) {
      shufflePlayArray();
      setArrayToList(playArrayEl, playingArray());
    }
  } else {
    playingIndex++;
  }

  backCount = Math.max(--backCount, 0);
  getAndSetTrackInfo();
}

/** 再生状態をスイッチするメソッド */
async function togglePlay() {
  //* 再生リストが空の時
  if (playerState === 'stop') {
    await setPlayArray();

    prevEl.disabled = false;
    nextEl.disabled = false;
  }

  //* 停止中の場合、「再生」
  if (playerState === 'pause') {
    audioEl.play();
    document.querySelector('.paused').classList.remove('paused');
  }
  //* 再生中の場合、「停止」
  if (playerState === 'playing') {
    audioEl.pause();
    document.querySelector('.playing').classList.add('paused');
  }
}

/** 曲が更新された時に歌詞（タイムテーブル）を取得 */
function getAndSetTrackInfo() {
  playerState = 'loading';
  prevEl.disabled = true;
  nextEl.disabled = true;

  const song = playingSong();
  song.setLyrics();
  audioEl.src = song.path;
  titleEl.textContent = song.title;
  artistEl.textContent = song.artist;

  //* 歌詞を表示
  createLyricsElement(song);
  lyricsEl.scroll({ top: 0 });

  //* 自動スクロールの開始
  isAuto = true;
  toggleButtonDisplay(autoEl, false);
  toggleButtonDisplay(jumpEl, song.timeTable.length !== 0);
  recordEl.disabled = lyrics.length === 0;

  movePlayingClass();
}

/**
 * 歌詞を表示させるメソッド
 * @param {Song} song 
 */
function createLyricsElement(song) {
  const lyrics = song.lyrics;
  const timeTable = song.timeTable;
  const elements = lyrics.map((text, i) => {
    const li = document.createElement('li');
    li.textContent = text;
    if (timeTable && timeTable.length) {
      li.addEventListener('click', () => {
        if (isJumping) {
          audioEl.currentTime = timeTable[i];
          lyricsEl.classList.remove('jumping');
          jumpEl.querySelector('i').className = 'icon-target';
          isJumping = !isJumping;
        }
      });
    }
    return li;
  });
  while (lyricsEl.firstChild) {
    lyricsEl.removeChild(lyricsEl.firstChild);
  }
  lyricsEl.prepend(...elements);
}

/**
 * 曲のli要素を作成するメソッド
 * @param {HTMLElement} target 要素を追加するList要素
 * @param {Song} song 曲オブジェクト
 * @return {HTMLLIElement}
 */
function createSongElement(target, song) {
  const li = document.createElement('li');
  const artwork = document.createElement('div');
  const img = document.createElement('img');
  const title = document.createElement('span');
  const artist = document.createElement('span');

  artwork.className = 'artwork';
  title.textContent = song.title;
  artist.textContent = song.artist;

  //* 追加させる要素によって構造を変更
  switch (target) {
    case candidateEl:
      //* リストにチェックをつける機構を追加
      const els = createCheckableElement(song);
      li.append(...els);
      break;
    case playArrayEl:
      //* 再生中を示すアニメーションを追加
      const animeEl = createPlayAnimationElement();
      artwork.append(animeEl);
      //* ダブルクリックでその曲を再生するイベントハンドラを設定
      li.addEventListener('dblclick', () => dblclickToPlay(li, song));
      break;
    case checkedEl:
      //* クリックすると選択済から削除するイベントを追加
      li.id = 'song-id-' + song._id;
      li.addEventListener('click', () => {
        li.remove();
        const tSong = candidateEl.querySelector(`#checkbox-${song._id}`);
        if (tSong) tSong.checked = false;
        checkedArray = checkedArray.filter(n => n._id !== song._id);
      });
      break;
    default:
      break;
  }

  artwork.prepend(img);
  li.append(artwork, title, artist);
  return li;
}

/**
 * 検索結果の曲表示要素の作成
 * @param {Song} song 曲オブジェクト
 */
function createCheckableElement(song) {
  //* リストにチェックをつける機構を追加
  const checkbox = document.createElement('input');
  const label = document.createElement('label');
  checkbox.type = 'checkbox';
  checkbox.id = 'checkbox-' + song._id;
  label.htmlFor = 'checkbox-' + song._id;
  //* 初期チェック
  checkbox.checked = checkedArray.some(n => n._id === song._id);

  //* チェックボックスにイベントハンドラを設定
  checkbox.addEventListener('change', (event) => {
    if (event.target.checked) {
      checkedArray.push(song);
      const li = createSongElement(checkedEl, song);
      song.displayArtwork(li.querySelector('img'));
      checkedEl.prepend(li);
    } else {
      checkedArray = checkedArray.filter(n => n._id !== song._id);
      document.getElementById(`song-id-${song._id}`).remove();
    }
  });
  return [checkbox, label];
}

/** 再生中アニメーションを表示するための要素を作成 */
function createPlayAnimationElement() {
  const animeEl = document.createElement('div');
  const line1 = document.createElement('div');
  const line2 = document.createElement('div');
  const line3 = document.createElement('div');
  animeEl.className = 'playing-animation';
  animeEl.append(line1, line2, line3);
  return animeEl
}

/**
 * ダブルクリックでその曲を再生するためのメソッド
 * @param {HTMLElement} elem 対象の要素
 * @param {Song} song 再生リスト内の曲
 */
function dblclickToPlay(elem, song) {
  //* 再生中の場合発火しない
  if (elem.classList.contains('playing')) return;

  playingIndex = song.index;
  backCount = 0;
  getAndSetTrackInfo();
}

/** 再生リストを生成するメソッド */
async function setPlayArray() {
  playingIndex = 0;
  //* シャッフルしたリストを同時に作成
  shufflePlayArray(true);
  //* 再生リストを表示させる
  setArrayToList(playArrayEl, playingArray());

  getAndSetTrackInfo();
}

/**
 * 再生リストを表示させるメソッド
 * @param {HTMLElement} target 表示対象
 * @param {Song[]} array 表示させるリスト
 */
function setArrayToList(target, array) {
  /** ul要素に挿入するli要素の配列 */
  const addList = [];
  //* 曲ごとにli要素を作成、データ挿入
  for (let i = 0, len = array.length; i < len; i++) {
    const elem = createSongElement(target, array[i]);

    //* 表示された時にアートワークを読み込むイベントハンドラを設定
    delayLoad(target, elem, /** @param {HTMLElement} el */ function(el) {
      const imgEl = el.querySelector('img');
      array[i].displayArtwork(imgEl);
    });
    //* 再生中の曲に "playing" classを追加
    if (target === playArrayEl && i === playingIndex) elem.classList.add('playing');
    addList.push(elem);
  }
  //* リスト既存のリストを削除してから追加する
  while (target.firstChild && target.firstChild.nodeName === 'LI') {
    target.removeChild(target.firstChild);
  }
  target.prepend(...addList);
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

function movePlayingClass() {
  const playing = playArrayEl.querySelector('.playing');
  if (playing) playing.classList.remove('playing');
  playArrayEl.children[playingIndex].classList.add('playing');
}

const perPage = 30;
/**
 * 曲の検索（空白区切のAND検索、[曲名, アーティスト名, アルバム名]）
 * @param {AsyncNedb<any>} db 曲データベース
 * @param {string} text 検索文字列
 * @param {number} page 検索するページ
 * @return {Promise<Song[]>} 
 */
async function searchSongs(db, text, page) {
  const option = [['sort', { title: 1 }], ['limit', perPage], ['skip', perPage * (page - 1)]];

  if (text === '') {
    const all = await db.asyncFind({}, option);
    return all.map(n => new Song(n));
  };

  //* キーワード毎に正規表現（部分一致）化する
  const query = createSearchQuery(text);
  //* データベース内をクエリに従って検索・表示
  const songs = await db.asyncFind(query, option);

  return songs.map(n => new Song(n));
}

/**
 * 曲検索結果の総ページ数を返すメソッド
 * @param {AsyncNedb<any>} db 曲データベース
 * @param {string} text 検索文字列
 * @return {Promise<number>} 検索結果の総ページ数
 */
async function searchtSongsCount(db, text) {
  if (text === '') {
    const count = await db.asyncCount({});
    return Math.ceil(count / perPage);
  };

  //* キーワード毎に正規表現（部分一致）化する
  const query = createSearchQuery(text);
  //* データベース内をクエリに従って検索・表示
  const total = await db.asyncCount(query);
  return Math.ceil(total / perPage);
}

/**
 * 検索文字列からNeDBのクエリに整形するメソッド
 * @param {string} text 検索文字列
 * @return {any} NeDBで取得したいクエリオブジェクト
 */
function createSearchQuery(text) {
  const words = text.split(/[ 　]/);
  //* キーワード毎に正規表現（部分一致）化する
  const regs = words.filter(word => word !== '').map(word => new RegExp(word, 'i'));
  //* 検索カラム
  const songColumn = ['title', 'artist', 'album'];
  //* 検索ワードに対してAND検索、カラムに対してOR検索
  const andQuery = regs.map(regex => {
    const orQuery = songColumn.map(col => ({ [col]: regex }));
    return { $or: orQuery };
  });
  return { $and: andQuery };
}

/**
 * 検索周りをまとめたメソッド。初期検索にも、ページネーションでも使用
 * @param {number} direction 検索したいページのEnum `[-1, 0, 1]`
 * @param {AsyncNedb<any>} songDB 曲データベース
 * @param {text} keyword 検索文字列
 * @return {Promise<void>}
 */
async function searchPagination(direction, songDB, keyword) {
  //* 一番上にスクロールを戻す
  candidateEl.scroll({ top: 0 });
  //* 検索したいページ
  const page = direction ? Number(currentPageEl.textContent) + direction : 1;
  //* 総ページ数
  const totalPage = Number(totalPageEl.textContent);
  //* 現在ページ： 総ページ数が "0" の時に "0"にする
  currentPageEl.textContent = Math.min(page, totalPage);
  //* 「前ページ」「次ページ」の有効化の判定
  prevPageEl.disabled = page === 1;
  nextPageEl.disabled = page >= Number(totalPage);
  //* キーワード検索でページネーション
  const songs = await searchSongs(songDB, keyword, page);
  setArrayToList(candidateEl, songs);
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
  const song = playingSong();
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
      if (song.timeTable.length) {
        const i = recordedArray.length;
        recordedArray.push(song.timeTable[i]);
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
  if (recordedArray.length === song.lyrics.length) {
    const res = confirm('タイムテーブルを登録しますか？');
    if (res) {
      //* タイムテーブルを保存
      await song.updateTimeTable(recordedArray);
      //* 保存したら最初から再生
      audioEl.currentTime = 0;
      lyricsEl.scroll({ top: 0 });
    }

    //* タイムテーブル作成を停止
    quitRecord();
    recordEl.checked = false;
  }
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

/** 再生箇所の歌詞を強調表示させる */
function trackLyrics() {
  /** `#lyrics`要素の子要素 */
  const liElements = lyricsEl.children;
  const len = liElements.length;
  const times = recordEl.checked ? recordedArray : playingSong().timeTable;
  for (let i = 0; i < len; i++) {
    if (times.length || recordEl.checked) {
      //* タイムテーブルを参照し、再生時間よりも小さいものを強調表示
      liElements[i].className = times[i] && times[i] < currentTime ? `passed ${fontColor}` : '';
    } else {
      //* タイムテーブルがない場合、経過時間と曲の長さで大体のところまで
      liElements[i].className = (i < (len * (currentTime / duration))) ? 'passed none' : '';
    }
  }

  //* 自動スクロールがONならば
  if (isAuto) {
    scrollToLyrics();
  }
}

/** 現在の歌詞の位置へスクロール */
function scrollToLyrics() {
  /** `.passed`クラス要素の配列 */
  const passedClassEls = document.getElementsByClassName('passed');
  if (passedClassEls.length === 0) {
    lyricsEl.scroll({ top: 0, behavior: 'smooth' });
    return;
  }
  /** 対象の要素 */
  const target = passedClassEls[passedClassEls.length - 1];
  /** 画面上部から要素までの距離 */
  const clientTop = target.getBoundingClientRect().top;
  /** 誤差の補正 */
  const CORRECTION = 12;
  /** スクロール高さ */
  const top = clientTop + lyricsEl.scrollTop - ((window.innerHeight + HEADER_HEIGHT + TABS_HEIGHT) / 2) + CORRECTION;
  lyricsEl.scroll({ top, behavior: 'smooth' });
}

/**
 * iTunesの曲情報を更新するメソッド。Musicフォルダを選択し、InputEventで配列を取得
 * @param {InputEvent} event InputEvent
 */
async function updateSongList(event) {
  /** ファイルの配列 */
  const files = event.target.files;
  /** iTunesの曲が存在しているフォルダパス */
  //TODO: ミュージックフォルダを取得する方法
  const musicPath = '/Users/shiozawatakuto/Music/iTunes/iTunes Media/';
  /** 曲情報データベース */
  const db = new AsyncNedb({
    filename: Path.join(__dirname, 'db/songs.db'),
    autoload: true,
  });
  /** 現在時刻 */
  const updatedAt = new Date();

  //* 返ってきた曲を配列で取得し、それぞれ処理
  for (let i = 0, len = files.length; i < len; i++) {
    //* オーディオファイルでない場合飛ばす
    if (files[i].type.indexOf('audio') === -1) continue;

    /** ファイルの相対パス */
    const path = musicPath + files[i].webkitRelativePath;
    //* node-id3によって, mp3のID3タグ情報を取得
    const id3tag = NodeID3.read(path);

    /** 擬似`Song`オブジェクト */
    const song = createPseudoSong({ ...id3tag, path, updatedAt });
    //* 曲情報をUPSERTする
    await db.asyncUpdate(pick(song, ['title', 'artsit', 'album']), { $set: song }, { upsert: true });
  }
  //* 古いデータを削除
  await db.asyncRemove({ updatedAt: { $ne: updatedAt } }, { multi: true });
}

/** 擬似的な`Song`オブジェクトを作成 */
function createPseudoSong({ title, artist, album, trackNumber, path, updatedAt }) {
  return {
    title: modifyVoicedMarks(title || path.split('/').pop().split('.')[0]),
    artist: modifyVoicedMarks(artist),
    album: modifyVoicedMarks(album) || 'Unknown Album',
    trackNumber: trackNumber && Number(trackNumber.split('/')[0]),
    path,
    updatedAt,
  };
}

/**
 * Lodash.pick と同じ挙動の関数
 * @param {Object} object 対象オブジェクト
 * @param {Array<string>} paths 検索キー
 * @return {Object}
 */
function pick(object, paths) {
  let obj = {};
  const objectKeys = Object.keys(object);
  paths.forEach(path => {
    if (objectKeys.indexOf(path) !== -1) {
      obj = { ...obj, [`${path}`]: object[path] };
    }
  }); 

  return obj;
}

/**
 * （半）濁点つきの文字を修正
 * @param {string} text 修正する文字列
 * @param {string} 修正された文字列
 */
async function modifyVoicedMarks(text) {
  if (!text) return text;
  const map = {
    'が': 'が', 'ぎ': 'ぎ', 'ぐ': 'ぐ', 'げ': 'げ', 'ご': 'ご',
    'ガ': 'ガ', 'ギ': 'ギ', 'グ': 'グ', 'ゲ': 'ゲ', 'ゴ': 'ゴ',
    'ざ': 'ざ', 'じ': 'じ', 'ず': 'ず', 'ぜ': 'ぜ', 'ぞ': 'ぞ',
    'ザ': 'ザ', 'ジ': 'ジ', 'ズ': 'ズ', 'ゼ': 'ゼ', 'ゾ': 'ゾ',
    'だ': 'だ', 'ぢ': 'ぢ', 'づ': 'づ', 'で': 'で', 'ど': 'ど',
    'ダ': 'ダ', 'ヂ': 'ヂ', 'ヅ': 'ヅ', 'デ': 'デ', 'ド': 'ド',
    'ば': 'ば', 'び': 'び', 'ぶ': 'ぶ', 'べ': 'べ', 'ぼ': 'ぼ',
    'バ': 'バ', 'ビ': 'ビ', 'ブ': 'ブ', 'ベ': 'ベ', 'ボ': 'ボ',
    'ぱ': 'ぱ', 'ぴ': 'ぴ', 'ぷ': 'ぷ', 'ぺ': 'ぺ', 'ぽ': 'ぽ',
    'パ': 'パ', 'ピ': 'ピ', 'プ': 'プ', 'ペ': 'ペ', 'ポ': 'ポ',
    'ゔ': 'ゔ', 'ヴ': 'ヴ',
  };
  const reg = new RegExp('(' + Object.keys(map).join('|') + ')', 'g');
  return text
    .replace(reg, function(match) {
      return map[match];
    });
}

/**
 * 秒数を時刻`MM:SS`にフォーマットするメソッド
 * @param {number} time 時間（秒）
 * @return {string} 時刻 `MM:SS`
 */
function convertTime(time) {
  return Math.floor(time / 60) + ':' + ('0' + Math.floor(time % 60)).slice(-2);
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

/** プレイリストを表示させるメソッド */
function setPlaylistsToList() {
  const addList = [];
  for (let i = 0, len = playlistArray.length; i < len; i++) {
    const item = createPlaylistElement(playlistArray[i]);
    addList.push(item);
  }
  playlistsEl.append(...addList);
}

/**
 * プレイリスト要素を作成するメソッド
 * @param {Playlist} playlist `Playlist`オブジェクト
 * @return {HTMLLIElement} プレイリスト要素
 */
function createPlaylistElement(playlist) {
  const item = document.createElement('li');
  item.className = 'playlist__item';
  const icon1 = document.createElement('i');
  icon1.className = 'icon-pencil';
  const icon2 = document.createElement('i');
  icon2.className = 'icon-control-play';
  const name = document.createElement('div');
  name.className = 'playlist__name';
  name.textContent = playlist.name;
  const count = document.createElement('div');
  count.className = 'playlist__count';
  count.textContent = `${playlist.count}曲`;

  //* 編集ボタンを押した時、名前変更モーダルを表示
  icon1.addEventListener('click', (event) => {
    event.stopPropagation();
    editPlaylistName(playlist, item);
  });
  //* 再生ボタンを押した時、プレイリストを再生
  icon2.addEventListener('click', async (event) => {
    event.stopPropagation();
    playArray = await playlist.songs();
    playingIndex = 0;
    movePlaylistToTop(playlist);
    await setPlayArray();
    await playlist.updatePlaylistData({ latestPlayedAt: new Date() });
    snapper.close();
  });
  //* プレイリストを押した時、内容を表示
  item.addEventListener('click', async () => {
    radioChecked.checked = true;
    checkedArray = await playlist.songs();
    setArrayToList(checkedEl, checkedArray);
    addPlaylistEditEvent(playlist, item);
    snapper.close();
  });
  item.append(icon1, icon2, name, count);
  return item;
}

/**
 * プレイリストの名称を変更するイベントを付加するメソッド
 * @param {Playlist} playlist プレイリスト
 * @param {HTMLElement} element プレイリスト要素
 */
function editPlaylistName(playlist, element) {
  const nameEl = element.querySelector('.playlist__name');
  dlgInputEl.value = nameEl.textContent;
  dialogEl.showModal();
  dlgCancelEl.onclick = () => dialogEl.close();
  dlgSubmitEl.onclick = async () => {
    nameEl.textContent = dlgInputEl.value;
    await playlist.updatePlaylistData({ name: dlgInputEl.value });
    dialogEl.close();
    dlgInputEl.value = "";
  };
}

/**
 * プレイリストを再生した時に一番上に持っていくメソッド
 * @param {Playlist} playlist プレイリスト
 */
function movePlaylistToTop(playlist) {
  const index = playlistArray.findIndex(n => n._id === playlist._id);
  playlistArray.splice(index, 1);
  playlistArray.unshift(playlist);
  playlistsEl.querySelectorAll('.playlist__item:not(#new-playlist)')[index].remove();
  const elem = createPlaylistElement(playlist);
  newPlaylistEl.after(elem);
}

/**
 * プレイリストの曲リストを変更するイベントを付加するメソッド
 * @param {Playlist} playlist プレイリスト
 * @param {HTMLElement} element プレイリスト要素
 */
function addPlaylistEditEvent(playlist, element) {
  //* プレイリストの編集がキャンセルされた時
  cancelEditEl.onclick = () => {
    checkedArray = [];
    radioPlayArr.checked = true;
  };

  //* プレイリストの編集が完了した時
  compEditEl.onclick = async () => {
    await playlist.changeSongList(checkedArray);
    element.querySelector('.playlist__count').textContent = `${playlist.count}曲`;
    radioPlayArr.checked = true;
    checkedArray = [];
  };
}

/**
 * ボタンの表示・非表示の切り替え
 * @param {HTMLButtonElement} button ボタン要素
 * @param {Boolean} isDisplayed 表示するか否か
 */
function toggleButtonDisplay(button, isDisplayed) {
  isDisplayed
    ? button.classList.replace('display-none', 'display')
    : button.classList.replace('display', 'display-none');
}

//* アプリ読み込み時に
window.onload = async () => {
  //* フォントカラーの選択オプションを追加
  ColorEnum.forEach(color => {
    const option = document.createElement('option');
    option.value = color;
    option.innerText = color;
    option.selected = color === fontColor;

    colorEl.appendChild(option);
  });

  //* 初期音量設定
  volumeEl.value = audioEl.volume;

  //* プレイリストの取得
  const playlistDB = new AsyncNedb({
    filename: Path.join(__dirname, 'db/playlists.db'),
    autoload: true,
  });
  const playlists = await playlistDB.asyncFind({}, [['sort', { latestPlayedAt: -1 }]]);
  playlistArray = playlists.map(playlist => new Playlist(playlist));
  setPlaylistsToList();
  //* 最後に再生したプレイリストを再生リストにする
  playArray = await playlistArray[0].songs();
};

//* デフォルトのキーイベントを設定
window.addEventListener('keydown', defaultKeyEvent);

//* ウィンドウがリサイズが完了（と判定）した時
window.addEventListener('resize', completedFunction(() => {
  //* 現在のウィンドウサイズを取得
  const win = Remote.getCurrentWindow();
  const [width, height] = win.getSize();

  //* Snap.jsの設定を変更
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
closeEl.onclick = () => Remote.getCurrentWindow().close();

//* ジャンプボタンを押した時
jumpEl.addEventListener('click', () =>{
  jumpEl.blur();
  isJumping = !isJumping;
  if (isJumping) {
    lyricsEl.classList.add('jumping');
    jumpEl.querySelector('i').className = 'icon-close';
  } else {
    lyricsEl.classList.remove('jumping');
    jumpEl.querySelector('i').className = 'icon-target';
  }
});

//* AUTOボタンクリック時、自動スクロールの開始
autoEl.addEventListener('click', () => {
  autoEl.blur();
  isAuto = true;
  toggleButtonDisplay(autoEl, false);
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
  toggleButtonDisplay(autoEl, true);
});

//* シャッフルボタン
shuffleEl.addEventListener('change', (event) => {
  const song = playingSong();
  isShuffle = event.target.checked;
  if (isShuffle) {
    //* 再生リストをもとにシャッフルする
    shufflePlayArray(false);
  } else {
    //* もとの再生リストの順番で再生する
    playingIndex = song.index;
  }
  setArrayToList(playArrayEl, playingArray());
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
  playerState = 'playing';
  audioEl.play();
  duration = audioEl.duration;
  durationEl.textContent = convertTime(duration);
  progressEl.max = Math.floor(duration);
  progressEl.disabled = false;
  prevEl.disabled = false;
  nextEl.disabled = false;
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
  playingSong().displayArtwork(imageEl);
});

//* フォーム入力時はキーイベントの発火を取り消し
searchEl.addEventListener('focus', () => {
  window.removeEventListener('keydown', defaultKeyEvent);
  searchEl.addEventListener('blur', () => {
    window.addEventListener('keydown', defaultKeyEvent);
  }, { once: true });
});

//* 曲の検索機能
searchEl.addEventListener('change', async (event) => {
  const songDB = new AsyncNedb({
    filename: Path.join(__dirname, 'db/songs.db'),
    autoload: true,
  });
  const keyword = event.target.value;
  const totalPages = await searchtSongsCount(songDB, keyword);
  totalPageEl.textContent = totalPages;

  await searchPagination(0, songDB, keyword);

  prevPageEl.onclick = async () => await searchPagination(-1, songDB, keyword);
  nextPageEl.onclick = async () => await searchPagination(1, songDB, keyword);
});

//* 新規プレイリスト追加ボタンが押された時
newPlaylistEl.addEventListener('click', async () => {
  const playlistDB = new AsyncNedb({
    filename: Path.join(__dirname, 'db/playlists.db'),
    autoload: true,
  });
  const newPlaylist = await playlistDB.asyncInsert({ name: '新規プレイリスト', songIds: [], updatedAt: new Date() });
  const playlist = new Playlist(newPlaylist)
  const item = createPlaylistElement(playlist);
  playlistsEl.append(item);
  editPlaylistName(playlist, item);
});

//* 並び替えドラッグ
sortable.on('sortable:sorted', (event) => {
  const { oldIndex, newIndex } = event;
  //* 現在再生中の時、新しいIndexを現在地にする
  if (oldIndex === playingIndex) playingIndex = newIndex;
  //* 曲の配列を入れ替える
  const moved = playingArray().splice(oldIndex, 1);
  playingArray().splice(newIndex, 0, ...moved);
});

const openListEl = document.getElementById('open-list');
openListEl.addEventListener('click', () => {
  snapper.open('left');
});