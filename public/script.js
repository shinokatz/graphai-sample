// public/script.js

// --- 要素取得 ---
const userMessageArea = document.getElementById('user-message-area');
const developerLogArea = document.getElementById('messages');
const imageElement = document.getElementById('generatedImage');
const storyElement = document.getElementById('story');
const userInputElement = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const imageDisplayElement = document.getElementById('image-display');
const generatedImageElement = document.getElementById('generatedImage');
const loadingIndicator = document.getElementById('loading-indicator');

// WebSocketサーバーに接続
const socket = new WebSocket('ws://localhost:3000');

let conversationHistory = [];

// --- WebSocketイベント処理 ---

socket.onopen = (event) => {
    console.log('WebSocket接続が開きました。');
    addDeveloperLog('サーバーに接続しました。', 'info');
    addUserMessage('サーバーに接続しました。', 'info');

    // ★★★ ゲーム開始コマンドを自動送信 ★★★
    // サーバー側がゲーム開始コマンドとして認識する文字列を指定してください。
    // 例として '始める' を使用します。サーバーの実装に合わせて変更してください。
    const startGameCommand = '始める';
    const dataToSend = { type: 'userInput', payload: startGameCommand };

    if (socket.readyState === WebSocket.OPEN) {
        try {
            socket.send(JSON.stringify(dataToSend));
            addDeveloperLog(`自動送信: ${startGameCommand}`, 'info');
            addUserMessage(`あなた (自動): ${startGameCommand}`, 'user'); // 自動送信したことを示す
            addUserMessage('ゲームを開始しています...', 'info');
            disableInput(); // ★ 最初の応答が来るまで入力は無効のまま
            resetImageArea();
            showLoadingIndicator("最初の応答を待っています...");
        } catch (e) {
            console.error("自動送信エラー:", e);
            addDeveloperLog("自動送信失敗: " + e.message, 'error');
            addUserMessage("ゲームの自動開始に失敗しました。", 'error');
            enableInput(); // 送信に失敗したら入力を有効にする
        }
    } else {
        // 通常、onopen直後であれば発生しにくいですが念のため
        addUserMessage("エラー: 接続直後に開始コマンドを送信できませんでした。", 'error');
        addDeveloperLog("自動送信失敗: WebSocketが開いていません", 'error');
        enableInput(); // 送信失敗のため入力を有効にする
    }
    // ★★★ 自動送信処理ここまで ★★★

    // enableInput(); // ← 最初の応答を受け取るまで無効のままにするので、ここでは呼ばない
};

socket.onmessage = (event) => {
    console.log('サーバーからメッセージを受信:', event.data);
    addDeveloperLog(`サーバーRaw: ${event.data}`);

    try {
        const data = JSON.parse(event.data);

        // ★ 応答を受け取ったら、ローディングを隠し入力を有効化する（handleNewMessage内で行う）

        if (data.type === 'newMessage') {
            handleNewMessage(data.payload.reply); // この中で enableInput() が呼ばれる
        } else if (data.type === 'newImage') {
            handleNewImage(data.payload.image);
        } else if (data.type === 'info') {
            addUserMessage(`情報: ${data.message}`, 'info');
            addDeveloperLog(`情報: ${data.message}`, 'info');
        } else if (data.type === 'error') {
            handleError(data.message); // この中で enableInput() が呼ばれる
        } else {
            addDeveloperLog(`サーバーから(未処理タイプ ${data.type}): ${JSON.stringify(data.payload || data.message)}`);
            console.warn("未対応のメッセージタイプ:", data.type);
            // 未知のタイプでも入力を有効にするか検討
            // enableInput();
            // hideLoadingIndicator();
        }

    } catch (e) {
        addDeveloperLog(`サーバーからの未処理メッセージ(パースエラー): ${event.data}`, 'error');
        addUserMessage('サーバーから受信したデータの形式が正しくありませんでした。', 'error');
        console.error("受信メッセージの解析エラー:", e);
        // パースエラーでも入力を有効にする
        enableInput();
        hideLoadingIndicator();
    }
};

socket.onerror = (error) => {
    console.error('WebSocketエラー:', error);
    addDeveloperLog('WebSocket接続でエラーが発生しました。', 'error');
    addUserMessage('接続エラーが発生しました。ページを再読み込みするか、しばらくしてから試してください。', 'error');
    hideLoadingIndicator(); // エラー時はローディング非表示
    enableInput(); // エラー時は入力可能にする
};

socket.onclose = (event) => {
    console.log('WebSocket接続が閉じました。 Code:', event.code, 'Reason:', event.reason);
    addDeveloperLog(`サーバーから切断されました。(Code: ${event.code})`, 'error');
    addUserMessage('サーバーとの接続が切れました。', 'error');
    hideLoadingIndicator(); // 切断時はローディング非表示
    disableInput(); // 切断されたら入力不可に
};

// --- UIイベント処理 ---
// (変更なし)
sendButton.addEventListener('click', sendMessageToServer);
userInputElement.addEventListener('keypress', (event) => {
    if (event.key === 'Enter' && !sendButton.disabled) {
        sendMessageToServer();
    }
});

// --- 関数定義 ---

// ★ ユーザーメッセージエリアにメッセージを追加する関数
// (変更なし)
function addUserMessage(message, type = 'normal') {
    if (!userMessageArea) {
        console.warn('ID "user-message-area" の要素が見つかりません。HTMLファイルを確認してください。');
        addDeveloperLog(`[ユーザー向け表示失敗] type:${type}, message:${message}`, 'warn');
        return;
    }
    const messageElement = document.createElement('div');
    messageElement.textContent = message;
    messageElement.classList.add('user-message');
    if (type === 'user') { messageElement.classList.add('user-message-user'); }
    else if (type === 'ai') { messageElement.classList.add('user-message-ai'); }
    else if (type === 'info') { messageElement.classList.add('user-message-info'); }
    else if (type === 'error') { messageElement.classList.add('user-message-error'); }
    else if (type === 'warning') { messageElement.classList.add('user-message-warning'); }
    else { messageElement.classList.add('user-message-normal'); }
    userMessageArea.appendChild(messageElement);
    userMessageArea.scrollTop = userMessageArea.scrollHeight;
}

// AIからの新しいテキスト応答を処理
function handleNewMessage(aiReply) {
    storyElement.textContent = aiReply; // メインのストーリーエリア更新
    addUserMessage(`AI: ${aiReply}`, 'ai'); // ユーザーメッセージエリアにAI応答を追加

    // ★ 応答を受け取ったのでローディングを隠し、入力を有効化
    hideLoadingIndicator();
    enableInput();

    // 画像生成のローディング表示 (画像生成がこの後すぐ始まる場合)
    showLoadingIndicator("画像を生成中..."); // 画像生成がない場合はこの行は不要かも
}

// 新しい画像データを処理
function handleNewImage(imageData) {
    hideLoadingIndicator(); // 画像受信したらローディングは確実に隠す
    if (imageData) {
        console.log("画像データ受信！");
        addDeveloperLog('画像データを受信しました。', 'info');
        generatedImageElement.src = imageData;
        generatedImageElement.style.display = 'block';
    } else {
        console.warn("画像データペイロードが空、または受信に失敗しました。");
        addDeveloperLog('画像データの受信に失敗しました。ペイロードが空です。', 'error');
        addUserMessage('画像の生成または表示に失敗しました。', 'error');
    }
    // 画像受信後も入力は有効なまま
    enableInput();
}

// エラーメッセージを処理
function handleError(errorMessage) {
    addUserMessage(`エラー: ${errorMessage}`, 'error');
    addDeveloperLog(`サーバーエラー: ${errorMessage}`, 'error');
    // ★ エラー発生時はローディング表示を隠し、入力を有効化
    hideLoadingIndicator();
    enableInput();
}

// メッセージをサーバーに送信
// (変更なし)
function sendMessageToServer() {
    const message = userInputElement.value.trim();
    if (message && socket.readyState === WebSocket.OPEN) {
        const dataToSend = { type: 'userInput', payload: message };
        socket.send(JSON.stringify(dataToSend));
        addUserMessage(`あなた: ${message}`, 'user');
        addDeveloperLog(`送信: ${message}`);
        addUserMessage('AIが応答を考えています...', 'info');
        userInputElement.value = '';
        disableInput(); // 送信後は応答待ちのため無効化
        resetImageArea(); // 新しい応答に備えて画像エリアリセット
        showLoadingIndicator("AIの応答を待っています...");
    } else if (socket.readyState !== WebSocket.OPEN) {
        addUserMessage("エラー: サーバーに接続されていません。", 'error');
        addDeveloperLog("送信試行失敗: サーバー未接続", 'error');
    }
}

// --- ユーティリティ関数 ---
// (disableInput, enableInput, resetImageArea, showLoadingIndicator, hideLoadingIndicator, addDeveloperLog は変更なし)
function disableInput() {
    userInputElement.disabled = true;
    sendButton.disabled = true;
}
function enableInput() {
    userInputElement.disabled = false;
    sendButton.disabled = false;
    // userInputElement.focus(); // 必要ならフォーカスを当てる
}
function resetImageArea() {
    generatedImageElement.style.display = 'none';
    generatedImageElement.src = '';
    // resetImageAreaではローディングを隠さない方が良いかも。
    // hideLoadingIndicator();
}
function showLoadingIndicator(message = "処理中...") {
    generatedImageElement.style.display = 'none';
    loadingIndicator.textContent = message;
    loadingIndicator.style.display = 'block';
}
function hideLoadingIndicator() {
    loadingIndicator.style.display = 'none';
}
function addDeveloperLog(message, type = 'normal') {
    if (!developerLogArea) {
        console.log(`DevLog [${type}]: ${message}`);
        return;
    }
    const messageElement = document.createElement('div');
    messageElement.textContent = `[${new Date().toLocaleTimeString()}] [${type}] ${message}`;
    messageElement.classList.add('log-message');
    if (type === 'error') { messageElement.classList.add('log-error'); }
    else if (type === 'info') { messageElement.classList.add('log-info'); }
    else if (type === 'warn') { messageElement.classList.add('log-warn'); }
    developerLogArea.appendChild(messageElement);
    developerLogArea.scrollTop = developerLogArea.scrollHeight;
}


// --- 初期化処理 ---
// ★★★ 初期状態では接続＆自動開始が終わるまで入力不可にする ★★★
disableInput();

storyElement.textContent = "テキストアドベンチャー";

// ★ ユーザーメッセージエリアの初期メッセージ (自動開始に合わせて変更)
addUserMessage("テキストアドベンチャーへようこそ！", 'info');
// addUserMessage("最初の行動を入力して「送信」を押してください。(例: 部屋を見渡す)", 'info'); // ← 自動開始するのでこのメッセージは変更
addUserMessage("サーバーに接続し、ゲームを自動的に開始します...", 'info'); // ← 新しい案内メッセージ

addDeveloperLog("クライアント初期化完了、WebSocketサーバー接続待ち...", 'info');