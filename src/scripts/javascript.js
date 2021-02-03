const execSync = require('child_process').execSync;
const path =  require('path');
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

const startEl = document.getElementById('start');
const stopEl = document.getElementById('stop');
const autoEl = document.getElementById('auto');
const registerEl = document.getElementById('register');
const colorEl = document.getElementById('color');
const titleEl = document.getElementById('title');
const artistEl = document.getElementById('artist');
const timeEl = document.getElementById('time');
const positionEl = document.getElementById('position');
const progressEl = document.getElementById('progress');
const lyricsEl = document.getElementById('lyrics');
const updateMusicEl = document.getElementById('update-music');
const searchEl = document.getElementById('search-song');
const keywordEl = document.getElementById('keyword');

//* 再生中の曲名・アーティスト名・再生時間
let trackTitle = '';
let trackArtist = '';
let trackTime = 300;
let lyricsArray = [];
//* Interval処理をする変数。clearするために外部で設定
let geterId;
let trackerId;
let counterId;
//* 再生時間
let playbackTime = 0;
//* iTunesから取得した再生時間
let nowPosition = 0;
//* 再生時刻の取得時刻
let countUpStart;
//* タイムテーブルの時間表（配列）
let timeArray = [];
let registeringArray = [];
//* タイムテーブル登録中？
let isRegistering = false;
//* アラート表示させるフラグ
let alertOn = true;
//* オートスクロールさせる?
let isAuto = true;
//* フォントカラー
let fontColor = 'red';
const colorOption = ['red', 'blue', 'green', 'white'];

/**
 * タイムテーブル登録でEnterを押すと時間が登録されるイベント
 * @param {KeyboardEvent} event 
 */
const pressKeyEvent = function(event) {
  switch (event.code) {
    //* Enterボタン押下でタイムテーブルに追加
    case 'Enter':
      const time = Math.floor(playbackTime * 100) / 100;
      registeringArray.push(time);
      break;

    //* 「←」「↑」ボタン押下で一つ戻す
    case 'ArrowLeft':
    case 'ArrowUp':
      registeringArray.pop();
      break;

    //* 再登録の場合「↓」「→」ボタン押下で元をコピー
    case 'ArrowDown':
    case 'ArrowRight':
      if (timeArray.length) {
        const i = registeringArray.length;
        registeringArray.push(timeArray[i]);
      }
      break;

    default:
      break;
  }

  //* 登録が終わったら確認して保存
  if (registeringArray.length === lyricsArray.length) {
    const res = confirm('タイムテーブルを登録しますか？');
    if (res) {
      //* タイムテーブルを保存
      registerTimeTable();
      //* 保存したら最初から再生
      repositionToBeginning();
      //* 登録したものをそのまま用いる
      timeArray = [...registeringArray];
      scrollTo(0, 0);
    }

    isRegistering = false;
    //* タイムテーブル作成を停止
    quitRegistering();
  }
}

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
      countUpStart = new Date();
      nowPosition = position;
      setTrackInfo(title, artist, time);
      //* タイムテーブル登録中に曲が変わった場合登録中止
      if (isRegistering) {
        quitRegistering();
      }
      isRegistering = false;
    }

    //* 取得する時間は正確に刻んでおらず、ブレてしまうので、
    //* 秒数が取得時間よりも大きく（0.75秒程度）ずれていたら変更。
    if (Math.abs(playbackTime - position) > 0.75) {
      countUpStart = new Date();
      nowPosition = position;
    }
  }, 2000);
}

/** 再生箇所の歌詞を強調表示させる */
function trackLyrics() {
  trackerId = setInterval(function() {
    const liElements = lyricsEl.children;
    const elRows = liElements.length;
    const times = isRegistering ? registeringArray : timeArray;
    for (let i = 0; i < elRows; i++) {
      if (times.length) {
        //* タイムテーブルを参照し、再生時間よりも小さいものを強調表示
        liElements[i].className = times[i] && times[i] < playbackTime ? `passed ${fontColor}` : '';
      } else {
        //* タイムテーブルがない場合、経過時間と曲の長さで大体のところまで
        liElements[i].className = (i < (elRows * (playbackTime / trackTime))) ? 'passed' : '';
      }
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
    progressEl.value = Math.floor(playbackTime);
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

/** 曲を一番最初から始めるメソッド */
function repositionToBeginning() {
  const iTunesOperatePath = path.join(__dirname, 'scripts', 'iTunesOperation.scpt');
  const script = 'osascript ' + iTunesOperatePath + ' "back"';
  execSync(script);
  //* 時間もリセット
  playbackTime = 0;
  nowPosition = 0;
  countUpStart = new Date();
}

function jumpPlayPosition(position) {
  const iTunesOperatePath = path.join(__dirname, 'scripts', 'iTunesOperation.scpt');
  const script = 'osascript ' + iTunesOperatePath + ' "jump" ' + position;
  execSync(script);
  playbackTime = position;
  nowPosition = position;
  countUpStart = new Date();
}

/**
 * 再生している曲のタイムテーブルを配列で取得するメソッド
 * @return {{ time: number, lyrics: string }[]} 
 *   歌詞とその表示時刻の配列
 */
function getTimeTable() {
  const findLyricsPath = path.join(__dirname, 'scripts', 'FinderOperation.scpt');
  const script = `osascript ${findLyricsPath} "get" "${trackTitle}" "${trackArtist}"`;
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

/** タイムテーブルを作成するメソッド */
function registerTimeTable() {
  const findLyricsPath = path.join(__dirname, 'scripts', 'FinderOperation.scpt');
  let script = `osascript ${findLyricsPath} "create" "${trackTitle}" "${trackArtist}"`;

  //* シェルスクリプトの引数にタイムテーブルを追加していく
  for (let i = 0; i < registeringArray.length; i++) {
    script += ` "[${registeringArray[i]}] ${lyricsArray[i]}"`;
  }

  execSync(script);
}

/** タイムテーブル作成を中止するメソッド */
function quitRegistering() {
  //* 登録中止する
  registerEl.textContent = timeArray.length ? '再登録' : '登録';
  lyricsEl.classList.remove('registering');
  //* Enterボタン押下でタイム記録するイベント削除
  document.removeEventListener('keydown', pressKeyEvent);
  registeringArray = [];
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
  progressEl.max = trackTime;
  //* 表示更新
  titleEl.textContent = trackTitle;
  artistEl.textContent = trackArtist;
  timeEl.textContent = time;

  const timeTable = getTimeTable();
  if (timeTable) {
    //* タイムテーブルが存在する時、色替え機能を開始
    //* インターバル処理多重起動の防止のため、再起動
    timeArray = timeTable.map(n => n.time);
    lyricsArray = timeTable.map(n => n.lyrics);
    registerEl.textContent = '再登録';
  } else {
    timeArray = [];
    //* iTunesから歌詞を取得。戻り値の配列が先頭空白なので消去
    lyricsArray = getOriginalLyrics().slice(1);
    registerEl.textContent = '登録';
  }
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
    filename: 'src/db/musics.db',
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
    filename: 'src/db/musics.db',
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
  console.log(songIds);

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

//* アプリ読み込み時に
window.onload = () => {
  //* フォントカラーの選択オプションを追加
  colorOption.forEach(color => {
    const option = document.createElement('option');
    option.value = color;
    option.innerText = color;
    option.selected = color === fontColor;

    colorEl.appendChild(option);
  });

  //* 上下キー入力でのスクロールを抑制
  window.addEventListener('keydown', (event) => {
    switch (event.code) {
      case 'ArrowUp':
      case 'ArrowDown':
        event.preventDefault()
        break;
      default:
        break;
    }
  });
};

//* 歌詞取得開始ボタンクリック時
startEl.addEventListener('click', () => {
  startEl.blur();
  if (timeArray.length) {
    changeLyricsColor();
  }
  repeatGetPosition();
  trackLyrics();
  countUpStart = new Date();
  countUpTime();
  startEl.className = 'display-none';
  stopEl.className = 'display';
});

//* 停止ボタンクリック時
stopEl.addEventListener('click', () => {
  stopEl.blur();
  clearInterval(geterId);
  clearInterval(trackerId);
  clearInterval(counterId);
  startEl.className = 'display';
  stopEl.className = 'display-none';
});

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
registerEl.addEventListener('click', () => {
  registerEl.blur();
  if (isRegistering) {
    //* タイムテーブル登録を中止
    quitRegistering();
  } else {
    registerEl.textContent = '登録中止';
    lyricsEl.classList.add('registering');
    //* 曲を最初から再生し始める
    repositionToBeginning();
    //* Enterボタン押下でタイム記録するイベント追加
    document.addEventListener('keydown', pressKeyEvent);
  }
  isRegistering = !isRegistering;
});

//* フォントカラー変更
colorEl.addEventListener('change', (event) => {
  colorEl.blur();
  const color = event.target.value;
  fontColor = color;
});

//* プログレスバーを操作中
progressEl.addEventListener('input', (event) => {
  //* 機能を一時停止
  clearInterval(geterId);
  clearInterval(changerId);
  clearInterval(counterId);
  //* プログレスバーの現在位置を更新
  const time = event.target.value;
  positionEl.textContent = Math.floor(time / 60) + ':' + ('0' + Math.floor(time % 60)).slice(-2);
});

//* プログレスバー操作終了時
progressEl.addEventListener('change', (event) => {
  //* 停止していた機能の再起動
  //* タイムテーブル登録時も歌詞色替え機能再開
  if (timeArray.length || registeringArray.length) {
    changeLyricsColor();
  }
  repeatGetPosition();
  countUpStart = new Date();
  countUpTime();
  //* 決定した再生時間にジャンプさせる
  jumpPlayPosition(Number(event.target.value));
});

//* 曲情報をアップデート
updateMusicEl.addEventListener('input', updateSongList);

//* 曲の検索
searchEl.addEventListener('click', searchSongs);
