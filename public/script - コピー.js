
// public/script.js

const messagesArea = document.getElementById('messages');
const imageElement = document.getElementById('generatedImage');

const storyElement = document.getElementById('story');
const userInputElement = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const imageDisplayElement = document.getElementById('image-display');
const generatedImageElement = document.getElementById('generatedImage');
const loadingIndicator = document.getElementById('loading-indicator');
const messagesLogElement = document.getElementById('messages'); // ログ表示エリア (HTMLに <div id="messages"> が必要)


// WebSocketサーバーに接続 (ws://localhost:3000 は server.mjs が動いているアドレス)
const socket = new WebSocket('ws://localhost:3000');

let conversationHistory = []; // 必要なら会話履歴を保持

// --- WebSocketイベント処理 ---

// 接続が確立したとき
socket.onopen = (event) => {
    console.log('WebSocket接続が開きました。');
    addMessageToLog('サーバーに接続しました。', 'info'); // タイプを追加
};

// サーバーからメッセージを受信したとき
socket.onmessage = (event) => {
    console.log('サーバーからメッセージを受信:', event.data);
    try {
        const data = JSON.parse(event.data); // 受信データはJSON形式と仮定

        // メッセージタイプに応じて処理を分岐 (今はechoとinfoだけ)
        // if (data.type === 'echo') {
        //     addMessageToLog(`サーバーEcho: ${JSON.stringify(data.payload)}`);
        // } else if (data.type === 'info') {
        //     addMessageToLog(`情報: ${data.message}`);
        // } else if (data.type === 'error') {
        //      addMessageToLog(`サーバーエラー: ${data.message}`);
        // }
        // メッセージタイプに応じて処理
        if (data.type === 'newMessage') {
            handleNewMessage(data.payload.reply);
        } else if (data.type === 'newImage') {
            handleNewImage(data.payload.image);
        } else if (data.type === 'info') {
            addMessageToLog(`情報: ${data.message}`, 'info');
        } else if (data.type === 'error') {
            handleError(data.message);
        } else {
            addMessageToLog(`サーバーから(未処理): ${event.data}`);
            console.warn("未対応のメッセージタイプ:", data.type);
        }

            // if (data.type === 'newMessage') {
            //     // ★ 新しいテキストメッセージ（AIの応答）
            //     storyElement.textContent = data.payload.reply; // メインのストーリーエリアを更新
            //     addMessageToLog(`AI:\n${data.payload.reply}`); // ログにも追加（任意）
            //     // 画像生成が始まるのでローディングを表示
            //     generatedImageElement.style.display = 'none'; // 前の画像を隠す
            //     loadingIndicator.style.display = 'block';
            //     userInputElement.disabled = false; // 次の入力が可能に
            //     sendButton.disabled = false;
    
            // } else if (data.type === 'newImage') {
            //     // ★ 新しい画像データを受信
            //     if (data.payload.image) {
            //         console.log("画像データ受信！");
            //         generatedImageElement.src = data.payload.image; // imgタグのsrcに設定
            //         generatedImageElement.style.display = 'block';  // 画像を表示
            //         loadingIndicator.style.display = 'none';   // ローディングを非表示
            //     } else {
            //         console.warn("画像データペイロードが空です。");
            //         loadingIndicator.textContent = '画像データの受信に失敗しました。';
            //     }
    
            // } else if (data.type === 'info') {
            //     addMessageToLog(`情報: ${data.message}`, 'info');
            // } else if (data.type === 'error') {
            //     addMessageToLog(`サーバーエラー: ${data.message}`, 'error');
            //     loadingIndicator.style.display = 'none'; // エラー時もローディング非表示
            //     userInputElement.disabled = false; // エラーでも入力は可能にする
            //     sendButton.disabled = false;
            // } else {
            //     // echo など、その他のメッセージタイプ
            //     addMessageToLog(`サーバーから: ${event.data}`);
            // }

    } catch (e) {
        // JSON形式でない、または予期せぬデータの場合
        addMessageToLog(`サーバーからの未処理メッセージ: ${event.data}`);
        console.error("受信メッセージの解析エラー:", e);
    }
};
socket.onerror = (error) => {
    console.error('WebSocketエラー:', error);
    addMessageToLog('WebSocket接続でエラーが発生しました。', 'error');
    enableInput();
};

socket.onclose = (event) => {
    console.log('WebSocket接続が閉じました。');
    addMessageToLog('サーバーから切断されました。', 'error');
    disableInput();
};

// --- UIイベント処理 ---
sendButton.addEventListener('click', sendMessageToServer);
userInputElement.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') { sendMessageToServer(); }
});

// --- 関数定義 ---

// AIからの新しいテキスト応答を処理
function handleNewMessage(aiReply) {
    storyElement.textContent = aiReply; // メインストーリーエリアを更新
    addMessageToLog(`AI:\n${aiReply}`); // ログにも追加
    enableInput(); // 応答が来たので入力を再度有効化
    showLoadingIndicator("画像を生成中..."); // 画像生成のローディング開始
}

// 新しい画像データを処理
function handleNewImage(imageData) {
    if (imageData) {
        console.log("画像データ受信！");
        addMessageToLog('画像を受信しました。', 'info');
        generatedImageElement.src = imageData; // imgタグのsrcに設定
        generatedImageElement.style.display = 'block';  // 画像を表示
        hideLoadingIndicator(); // ローディングを非表示
    } else {
        console.warn("画像データペイロードが空です。");
        addMessageToLog('画像データの受信に失敗しました。', 'error');
        hideLoadingIndicator();
    }
}

// エラーメッセージを処理
function handleError(errorMessage) {
    addMessageToLog(`サーバーエラー: ${errorMessage}`, 'error');
    hideLoadingIndicator();
    enableInput();
}

// メッセージをサーバーに送信
function sendMessageToServer() {
    const message = userInputElement.value.trim();
    if (message && socket.readyState === WebSocket.OPEN) {
        const dataToSend = { type: 'userInput', payload: message };
        socket.send(JSON.stringify(dataToSend));
        addMessageToLog(`あなた: ${message}`);
        storyElement.textContent += "\n\n...AIが応答を考えています..."; // 応答待ち表示を追加
        userInputElement.value = ''; // 入力欄クリア
        disableInput(); // 応答待ち中は入力不可
        resetImageArea(); // 画像エリアをリセット
    } else if (socket.readyState !== WebSocket.OPEN) {
        addMessageToLog("エラー: サーバーに接続されていません。", 'error');
    }
}

// 入力エリアを無効化
function disableInput() {
    userInputElement.disabled = true;
    sendButton.disabled = true;
}

// 入力エリアを有効化
function enableInput() {
    userInputElement.disabled = false;
    sendButton.disabled = false;
}

// 画像表示エリアをリセット
function resetImageArea() {
    generatedImageElement.style.display = 'none';
    generatedImageElement.src = '';
    loadingIndicator.style.display = 'none';
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

// メッセージをログエリアに追加
function addMessageToLog(message, type = 'normal') {
    if (!messagesLogElement) { // messages要素がなければコンソールログに
        console.log(`Log: [${type}] ${message}`);
        return;
     }
    const messageElement = document.createElement('div');
    // テキストとして追加（安全のため）
    messageElement.textContent = message;
    // タイプに応じてスタイルを適用（CSSクラスを使う方がより良い）
    messageElement.classList.add('log-message');
    if (type === 'error') { messageElement.classList.add('log-error'); }
    if (type === 'info') { messageElement.classList.add('log-info'); }

    messagesLogElement.appendChild(messageElement);
    messagesLogElement.scrollTop = messagesLogElement.scrollHeight; // 自動スクロール
}

// 初期表示メッセージ
storyElement.textContent = "テキストアドベンチャーへようこそ！\n最初の行動を入力して「送信」を押してください。(例: 始める)";
addMessageToLog("クライアント初期化完了、サーバー接続待ち...", 'info');
