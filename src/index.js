const { app, BrowserWindow } = require('electron');
const { AsyncNedb } = require('nedb-async');
const Path = require('path');

// メインウィンドウ
let mainWindow;

async function createWindow() {
  //* 保存されたウィンドウサイズ・位置を取得
  const windowDB = new AsyncNedb({
    filename: Path.join(__dirname, 'db/window.db'),
    autoload: true,
  });
  const windowData = await windowDB.asyncFindOne({});
  
  //* 画面サイズ
  const screenWidth = 1680;
  const screenHeight = 1050;
  //* ウィンドウサイズ
  const windowWidth = 500;
  const windowHeight = 600;

  //* デフォルト設定
  const defaultWindowOption = {
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
    },
    x: screenWidth - windowWidth,
    y: screenHeight - windowHeight,
    width: windowWidth,
    height: windowHeight,
    minWidth: 360,
    minHeight: 100,
    maxWidth: 600,
    maxHeight: screenHeight,
    alwaysOnTop: true,
    frame: false,
    maximizable: false,
  };

  //* メインウィンドウを作成
  mainWindow = new BrowserWindow(Object.assign(defaultWindowOption, windowData));

  // メインウィンドウに表示するURLを指定します
  // （今回はmain.jsと同じディレクトリのindex.html）
  mainWindow.loadFile('index.html');

  // デベロッパーツールの起動
  mainWindow.webContents.openDevTools();

  // メインウィンドウが閉じられたときの処理
  mainWindow.on('close', async () => {
    //* ウィンドウの設定を保存
    const bounds = mainWindow.getBounds();
    await windowDB.asyncUpdate({}, bounds, { upsert: true });

    mainWindow = null;
  });
}

//  初期化が完了した時の処理
app.on('ready', createWindow);

// 全てのウィンドウが閉じたときの処理
app.on('window-all-closed', () => {
  // macOSのとき以外はアプリケーションを終了させます
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// アプリケーションがアクティブになった時の処理(Macだと、Dockがクリックされた時）
app.on('activate', () => {
  // メインウィンドウが消えている場合は再度メインウィンドウを作成する
  if (mainWindow === null) {
    createWindow();
  }
});

// ウィンドウがフォーカスされた時、透過をなくす
app.on('browser-window-focus', () => {
  mainWindow.setOpacity(1);
});

// ウィンドウからフォーカスから外れた時、透過させる
app.on('browser-window-blur', () => {
  mainWindow.setOpacity(0.5);
});
