const { app, BrowserWindow } = require('electron');

// メインウィンドウ
let mainWindow;

function createWindow() {
  // 画面サイズ
  const screenWidth = 1680;
  const screenHeight = 1050;
  // ウィンドウサイズ
  const windowWidth = 500;
  const windowHeight = 600;

  // メインウィンドウを作成します
  mainWindow = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true,
    },
    x: screenWidth - windowWidth,
    y: screenHeight - windowHeight,
    width: windowWidth,
    height: windowHeight,
    alwaysOnTop: true,
  });

  // メインウィンドウに表示するURLを指定します
  // （今回はmain.jsと同じディレクトリのindex.html）
  mainWindow.loadFile('index.html');

  // デベロッパーツールの起動
  mainWindow.webContents.openDevTools();

  // メインウィンドウが閉じられたときの処理
  mainWindow.on('closed', () => {
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
