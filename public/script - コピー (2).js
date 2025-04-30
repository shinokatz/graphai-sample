// public/script.js

// --- 要素取得 ---
// ★ 新しいユーザー向けメッセージ表示エリア (HTMLに <div id="user-message-area"> が必要)
const userMessageArea = document.getElementById('user-message-area');
// 既存のログエリア (開発者向けログなどに使用)
const developerLogArea = document.getElementById('messages'); // ID 'messages' を開発者ログ用とする

// 他の要素
const imageElement = document.getElementById('generatedImage');
const storyElement = document.getElementById('story'); // メインのストーリー表示（AIの最新応答など）
const userInputElement = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const imageDisplayElement = document.getElementById('image-display');
const generatedImageElement = document.getElementById('generatedImage');
const loadingIndicator = document.getElementById('loading-indicator');


// WebSocketサーバーに接続 (ws://localhost:3000 は server.mjs が動いているアドレス)
const socket = new WebSocket('ws://localhost:3000');

let conversationHistory = []; // 必要なら会話履歴を保持

// --- WebSocketイベント処理 ---

// 接続が確立したとき
socket.onopen = (event) => {
    console.log('WebSocket接続が開きました。');
    addDeveloperLog('サーバーに接続しました。', 'info'); // 開発者ログ
    addUserMessage('サーバーに接続しました。', 'info');   // ★ ユーザーメッセージエリアへ
    enableInput(); // 接続したら入力を有効化
};

// サーバーからメッセージを受信したとき
socket.onmessage = (event) => {
    console.log('サーバーからメッセージを受信:', event.data);
    addDeveloperLog(`サーバーRaw: ${event.data}`); // Rawデータを開発者ログへ記録

    try {
        const data = JSON.parse(event.data); // 受信データはJSON形式と仮定

        // メッセージタイプに応じて処理を分岐
        if (data.type === 'newMessage') {
            // AIの応答を処理
            handleNewMessage(data.payload.reply);
        } else if (data.type === 'newImage') {
            // 画像データを処理
            handleNewImage(data.payload.image);
        } else if (data.type === 'info') {
            // ★ サーバーからの情報メッセージをユーザーエリアに表示
            addUserMessage(`情報: ${data.message}`, 'info');
            // 必要であれば開発者ログにも記録
            addDeveloperLog(`情報: ${data.message}`, 'info');
        } else if (data.type === 'error') {
            // ★ サーバーからのエラーメッセージを処理
            handleError(data.message); // handleError内でユーザーエリアと開発者ログに表示
        } else {
            // 未知のメッセージタイプは開発者ログに記録
            addDeveloperLog(`サーバーから(未処理タイプ ${data.type}): ${JSON.stringify(data.payload || data.message)}`);
            console.warn("未対応のメッセージタイプ:", data.type);
            // 必要ならユーザーにも何らかの通知を表示
            // addUserMessage(`サーバーから不明なメッセージタイプ(${data.type})を受信しました。`, 'warning');
        }

    } catch (e) {
        // JSONパースエラーなど、予期せぬデータの場合
        addDeveloperLog(`サーバーからの未処理メッセージ(パースエラー): ${event.data}`, 'error');
        addUserMessage('サーバーから受信したデータの形式が正しくありませんでした。', 'error'); // ★ ユーザーへエラー通知
        console.error("受信メッセージの解析エラー:", e);
        // エラーが発生しても入力を再度有効にするか検討
        // enableInput();
    }
};

// WebSocketエラー発生時
socket.onerror = (error) => {
    console.error('WebSocketエラー:', error);
    addDeveloperLog('WebSocket接続でエラーが発生しました。', 'error');
    addUserMessage('接続エラーが発生しました。ページを再読み込みするか、しばらくしてから試してください。', 'error'); // ★ ユーザーへエラー通知
    // エラー発生時に入力をどうするか（無効のままか、有効にするか）
    // disableInput(); // または enableInput();
};

// WebSocket接続が閉じたとき
socket.onclose = (event) => {
    console.log('WebSocket接続が閉じました。 Code:', event.code, 'Reason:', event.reason);
    addDeveloperLog(`サーバーから切断されました。(Code: ${event.code})`, 'error');
    addUserMessage('サーバーとの接続が切れました。', 'error'); // ★ ユーザーへ通知
    disableInput(); // 切断されたら入力不可に
};

// --- UIイベント処理 ---
sendButton.addEventListener('click', sendMessageToServer);
userInputElement.addEventListener('keypress', (event) => {
    // Enterキーが押され、かつ送信ボタンが有効な場合に送信
    if (event.key === 'Enter' && !sendButton.disabled) {
        sendMessageToServer();
    }
});

// --- 関数定義 ---

// ★ ユーザーメッセージエリアにメッセージを追加する関数
function addUserMessage(message, type = 'normal') {
    // userMessageArea要素が存在するか確認
    if (!userMessageArea) {
        console.warn('ID "user-message-area" の要素が見つかりません。HTMLファイルを確認してください。');
        // フォールバックとして開発者ログに出力
        addDeveloperLog(`[ユーザー向け表示失敗] type:${type}, message:${message}`, 'warn');
        return;
    }
    const messageElement = document.createElement('div');
    // メッセージをテキストとして設定 (XSS対策)
    messageElement.textContent = message;
    // 基本となるCSSクラス
    messageElement.classList.add('user-message');

    // タイプに応じたCSSクラスを追加 (例)
    if (type === 'user') {
        messageElement.classList.add('user-message-user'); // ユーザー自身の入力
    } else if (type === 'ai') {
        messageElement.classList.add('user-message-ai');   // AIからの応答
    } else if (type === 'info') {
        messageElement.classList.add('user-message-info');  // 情報メッセージ
    } else if (type === 'error') {
        messageElement.classList.add('user-message-error'); // エラーメッセージ
    } else if (type === 'warning') {
        messageElement.classList.add('user-message-warning'); // 警告メッセージ
    } else {
        messageElement.classList.add('user-message-normal'); // デフォルト/その他
    }

    userMessageArea.appendChild(messageElement);
    // 自動的に一番下までスクロールする
    userMessageArea.scrollTop = userMessageArea.scrollHeight;
}

// AIからの新しいテキスト応答を処理
function handleNewMessage(aiReply) {
    // メインのストーリーエリアは最新のAI応答で更新 (任意、不要ならコメントアウト)
    storyElement.textContent = aiReply;
    // ★ ユーザーメッセージエリアにAIの応答を追加
    addUserMessage(`AI: ${aiReply}`, 'ai');
    // 応答を受け取ったので入力を有効化
    enableInput();
    // 画像生成が始まることを示すローディング表示
    showLoadingIndicator("画像を生成中...");
}

// 新しい画像データを処理
function handleNewImage(imageData) {
    hideLoadingIndicator(); // 画像処理開始前にローディングを隠す
    if (imageData) {
        console.log("画像データ受信！");
        addDeveloperLog('画像データを受信しました。', 'info');
        // addUserMessage('画像を生成しました。', 'info'); // 必要なら画像生成完了をユーザーに通知
        generatedImageElement.src = imageData; // imgタグのsrcに設定
        generatedImageElement.style.display = 'block';  // 画像を表示
    } else {
        console.warn("画像データペイロードが空、または受信に失敗しました。");
        addDeveloperLog('画像データの受信に失敗しました。ペイロードが空です。', 'error');
        addUserMessage('画像の生成または表示に失敗しました。', 'error'); // ★ ユーザーへエラー通知
    }
}

// エラーメッセージを処理
function handleError(errorMessage) {
    // ★ ユーザーメッセージエリアにエラーを表示
    addUserMessage(`エラー: ${errorMessage}`, 'error');
    // 開発者ログにもエラーを記録
    addDeveloperLog(`サーバーエラー: ${errorMessage}`, 'error');
    // エラー発生時はローディング表示を隠す
    hideLoadingIndicator();
    // エラー後も入力は可能にする（サーバー側で対応できないエラーかもしれないため）
    enableInput();
}

// メッセージをサーバーに送信
function sendMessageToServer() {
    const message = userInputElement.value.trim();
    // メッセージが空でなく、WebSocket接続が開いている場合のみ送信
    if (message && socket.readyState === WebSocket.OPEN) {
        const dataToSend = { type: 'userInput', payload: message };
        socket.send(JSON.stringify(dataToSend));

        // ★ ユーザーメッセージエリアに自分の入力を表示
        addUserMessage(`あなた: ${message}`, 'user');
        // 開発者ログにも送信内容を記録 (任意)
        addDeveloperLog(`送信: ${message}`);

        // 応答待ちの表示をユーザーメッセージエリアに追加
        addUserMessage('AIが応答を考えています...', 'info');
        // メインのストーリーエリアにも応答待ち表示を追加 (任意)
        // storyElement.textContent += "\n\n...";

        userInputElement.value = ''; // 入力欄をクリア
        disableInput(); // 応答が返るまで入力を無効化
        resetImageArea(); // 画像表示エリアをリセット
        showLoadingIndicator("AIの応答を待っています..."); // ローディング表示

    } else if (socket.readyState !== WebSocket.OPEN) {
        // 接続されていない場合のエラーメッセージ
        addUserMessage("エラー: サーバーに接続されていません。", 'error');
        addDeveloperLog("送信試行失敗: サーバー未接続", 'error');
    } else if (!message) {
        // メッセージが空の場合 (任意で通知)
        // addUserMessage("メッセージを入力してください。", 'warning');
    }
}

// --- ユーティリティ関数 ---

// 入力エリアと送信ボタンを無効化
function disableInput() {
    userInputElement.disabled = true;
    sendButton.disabled = true;
}

// 入力エリアと送信ボタンを有効化
function enableInput() {
    userInputElement.disabled = false;
    sendButton.disabled = false;
    // userInputElement.focus(); // 入力欄にフォーカスを当てる (任意)
}

// 画像表示エリアを初期状態に戻す
function resetImageArea() {
    generatedImageElement.style.display = 'none';
    generatedImageElement.src = ''; // srcを空にする
    hideLoadingIndicator(); // ローディング表示も隠す
}

// ローディングインジケーターを表示
function showLoadingIndicator(message = "処理中...") {
    generatedImageElement.style.display = 'none'; // 画像は隠す
    loadingIndicator.textContent = message;
    loadingIndicator.style.display = 'block';
}

// ローディングインジケーターを非表示
function hideLoadingIndicator() {
    loadingIndicator.style.display = 'none';
}

// 開発者向けログエリアにメッセージを追加 (旧 addMessageToLog)
function addDeveloperLog(message, type = 'normal') {
    // developerLogArea要素が存在するか確認
    if (!developerLogArea) {
        console.log(`DevLog [${type}]: ${message}`); // 要素がなければコンソールに出力
        return;
    }
    const messageElement = document.createElement('div');
    messageElement.textContent = `[${new Date().toLocaleTimeString()}] [${type}] ${message}`; // タイムスタンプとタイプを追加
    messageElement.classList.add('log-message'); // 基本クラス
    // タイプに応じたクラスを追加
    if (type === 'error') { messageElement.classList.add('log-error'); }
    else if (type === 'info') { messageElement.classList.add('log-info'); }
    else if (type === 'warn') { messageElement.classList.add('log-warn'); }

    developerLogArea.appendChild(messageElement);
    // 自動スクロール
    developerLogArea.scrollTop = developerLogArea.scrollHeight;
}

// --- 初期化処理 ---
// disableInput(); // 初期状態では接続待ちのため入力不可にする場合

// メインのストーリーエリアの初期メッセージ (任意)
storyElement.textContent = "テキストアドベンチャー";

// ★ ユーザーメッセージエリアの初期メッセージ
addUserMessage("テキストアドベンチャーへようこそ！", 'info');
addUserMessage("最初の行動を入力して「送信」を押してください。(例: 部屋を見渡す)", 'info');

// 開発者ログの初期メッセージ
addDeveloperLog("クライアント初期化完了、WebSocketサーバー接続待ち...", 'info');