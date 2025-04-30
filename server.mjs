// server.mjs
import OpenAI from 'openai';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';

// --- GraphAI と Agent のインポート ---
import { GraphAI } from "./packages/graphai/lib/index.js";
import * as OpenAIAgentModule from './llm_agents/openai_agent/lib/openai_agent.js';
import * as OpenAIImageAgentModule from './llm_agents/openai_agent/lib/openai_image_agent.js';

// --- Dummy copyAgent (必要なら) ---
const copyAgentFunc = async ({ namedInputs }) => {
  console.log("--- Using Mock Copy Agent ---");
  console.log("Mock Copy Agent received namedInputs:", namedInputs);
  // グラフ定義で指定された入力名 (data) の値を取得
  if (namedInputs && namedInputs.data !== undefined) {
    return namedInputs.data;
  }
  return undefined;
};
const copyAgentInfo = {
    agent: copyAgentFunc,
    inputs: { type: "any" },
    outputs: { type: "any" }
};

// --- 使用する Agent 全体 ---
const allAgents = {
  "openAIAgent": { agent: OpenAIAgentModule.openAIAgent },
  "openaiImageAgent": { agent: OpenAIImageAgentModule.openAIImageAgent },
  "copyAgent": copyAgentInfo // ダミーの copyAgent Info を使用
};

// --- 起動時の Agent 検証ログ ---
console.log("--- Verifying Agent Functions (Startup) ---");
console.log("Type of allAgents['openAIAgent'].agent:", typeof allAgents['openAIAgent']?.agent);
console.log("Type of allAgents['openaiImageAgent'].agent:", typeof allAgents['openaiImageAgent']?.agent);
console.log("Type of allAgents['copyAgent'].agent:", typeof allAgents['copyAgent']?.agent);
console.log("------------------------------------------");

dotenv.config(); // .env ファイル読み込み

// --- テキスト生成用 GraphAI グラフ定義 ---
const textGraphData = {
  version: 0.5,
  nodes: {
    userInputNode: {
      value: null // プレースホルダー
    },
    chatLLM: {
      agent: "openAIAgent",
      params: { model: "gpt-4o" },
      inputs: { prompt: ":userInputNode" }
    },
    responseText: {
      agent: "copyAgent",
      inputs: { data: ":chatLLM.text" },
      isResult: true
    }
  }
};

// --- ★★★ 画像生成用 GraphAI グラフ定義を追加 ★★★ ---
const imageGraphData = {
  version: 0.5,
  nodes: {
    imagePromptNode: { // 画像生成プロンプトを受け取るノード
      value: null // プレースホルダー
    },
    generateImage: {
      agent: "openaiImageAgent", // 画像生成エージェント
      params: {
         model: "dall-e-3",    // 使用するモデル
         n: 1,               // 生成する画像数
         size: "1024x1024",    // 画像サイズ
         response_format: "b64_json", // ★ Base64形式で結果を受け取る場合
         // response_format: "url", // ★ URLで結果を受け取る場合
         // quality: "standard", // 必要なら品質なども指定
       },
      inputs: {
        prompt: ":imagePromptNode" // imagePromptNode の値をプロンプトとして使う
       }
    },
    imageDataResult: { // 結果をコピーするノード
      agent: "copyAgent",
      // ↓↓↓ openaiImageAgent の出力に合わせて調整が必要 ↓↓↓
      // DALL-E API(b64_json)の場合、結果は result.data[0].b64_json に入る想定
      inputs: { data: ":generateImage.result.data.$0.b64_json" }, // ★ Base64の場合の例
      // inputs: { data: ":generateImage.result.data.$0.url" }, // ★ URLの場合の例
      isResult: true
    }
  }
};

// --- 基本的な設定 ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const port = 3000;

// --- HTTPサーバー ---
const server = http.createServer((req, res) => {
  let filePath = path.join(publicDir, req.url === '/' ? 'index.html' : req.url);
  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const contentType = mimeTypes[extname] || 'application/octet-stream';
  fs.readFile(filePath, (error, content) => {
    if (error) { /* ... (エラー処理は省略) ... */ }
    else { res.writeHead(200, { 'Content-Type': contentType }); res.end(content, 'utf-8'); }
  });
});

// --- WebSocketサーバー ---
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('クライアントが接続しました (WebSocket)');
  ws.on('message', (message) => {
    try {
      const messageString = message.toString();
      console.log('受信メッセージ: %s', messageString);
      const receivedData = JSON.parse(messageString);
      if (receivedData.type === 'userInput' && receivedData.payload) {
        handleUserInput(ws, receivedData.payload); // テキスト生成へ
      } else { console.warn("未対応のメッセージタイプ:", receivedData.type); }
    } catch (e) { console.error('メッセージ処理エラー:', e); /* ... */ }
  });
  ws.on('close', () => { console.log('クライアントが切断しました'); });
  ws.on('error', (error) => { console.error('WebSocketエラー:', error); });
  ws.send(JSON.stringify({ type: 'info', message: 'サーバーに接続しました！' }));
});

// --- ★★★ 画像生成と結果送信の非同期関数を追加 ★★★ ---
// async function generateImageAsyncWithGraphAI(ws, textDescription) {
//   // LLM応答が短い場合などは画像生成しない、などの制御を入れても良い
//   if (!textDescription || textDescription.length < 10) { // 例: 短すぎる場合はスキップ
//     console.log("テキストが短すぎるため、画像生成をスキップします。");
//     return;
//   }
//   // 画像生成に適したプロンプトに加工する（ここでは簡単に英語にする例）
//   const imagePrompt = `Illustration in fantasy art style: ${textDescription.substring(0, 500)}`; // 簡単な加工例
//   console.log(`[${ws.clientId || 'N/A'}] 画像生成を開始... Prompt: "${imagePrompt.substring(0, 50)}..."`); // ws に ID があれば表示

//   try {
//     // GraphAI インスタンス作成 (画像生成用グラフ)
//     const imageGraph = new GraphAI(imageGraphData, allAgents);

//     // GraphAI 実行 (プロンプトを注入)
//     const imageResult = await imageGraph.run({
//       inputs: { imagePromptNode: imagePrompt },
//     });

//     // 画像データの取得 (imageGraphData の imageDataResult ノードから)
//     const generatedImageData = imageResult.imageDataResult;

//     if (generatedImageData) {
//       console.log(`[${ws.clientId || 'N/A'}] 画像生成成功！`);
//       // Base64 の場合は Data URL 形式にする (response_formatがb64_jsonの場合)
//       const imageDataPayload = imageGraphData.nodes.generateImage.params.response_format === "b64_json"
//                              ? `data:image/png;base64,${generatedImageData}`
//                              : generatedImageData; // URL の場合はそのまま

//       // ★ WebSocket でクライアントに送信 (新しいメッセージタイプ 'newImage')
//       ws.send(JSON.stringify({ type: 'newImage', payload: { image: imageDataPayload } }));
//       console.log(`[${ws.clientId || 'N/A'}] 生成された画像データを送信しました。`);
//     } else {
//       console.error(`[${ws.clientId || 'N/A'}] 画像生成に失敗、または画像データがありませんでした。`);
//       ws.send(JSON.stringify({ type: 'error', message: '画像の生成に失敗しました。' }));
//     }
//   } catch (imageError) {
//     console.error(`[${ws.clientId || 'N/A'}] 画像生成エラー:`, imageError);
//     ws.send(JSON.stringify({ type: 'error', message: `画像生成中にエラーが発生しました: ${imageError.message}` }));
//   }
// }

// --- 画像生成と結果送信の非同期関数 (GraphAI を使わない版) ---
async function generateImageAsyncWithDirectOpenAI(ws, textDescription) {
  // LLM応答が短い場合はスキップ
  if (!textDescription || textDescription.length < 10) {
    console.log("テキストが短すぎるため、画像生成をスキップします。");
    return;
  }
  const imagePrompt = `Illustration in fantasy art style: ${textDescription.substring(0, 500)}`;
  console.log(`画像生成を開始 (Direct OpenAI)... Prompt: "${imagePrompt.substring(0, 50)}..."`);

  try {
    // OpenAI クライアント初期化 (APIキーは .env から読み込まれる想定)
    const openai = new OpenAI(); // process.env.OPENAI_API_KEY を自動で読み込む

    // 画像生成APIを呼び出す
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json", // Base64で受け取る場合
    });

    // 結果から画像データを取り出す (OpenAIライブラリのバージョンにより若干異なる可能性あり)
    const b64_json = response.data?.[0]?.b64_json;

    if (b64_json) {
      console.log(`画像生成成功！ (Direct OpenAI - b64_json found)`);
      const imageDataPayload = `data:image/png;base64,${b64_json}`;
      ws.send(JSON.stringify({ type: 'newImage', payload: { image: imageDataPayload } }));
      console.log(`生成された画像データを送信しました。`);
    } else {
      console.error("画像生成は成功したかもしれませんが、期待した形式のデータ(b64_json)が見つかりませんでした。", response);
      ws.send(JSON.stringify({ type: 'error', message: '画像データ形式エラー(Direct OpenAI)。' }));
    }
  } catch (imageError) {
    console.error(`画像生成エラー (Direct OpenAI):`, imageError);
    ws.send(JSON.stringify({ type: 'error', message: `画像生成中にエラーが発生しました(Direct OpenAI): ${imageError.message}` }));
  }
}

// --- 画像生成と結果送信の非同期関数 ---
async function generateImageAsyncWithGraphAI(ws, textDescription) {
  // LLM応答が短い場合はスキップ (任意)
  if (!textDescription || textDescription.length < 10) {
    console.log("テキストが短すぎるため、画像生成をスキップします。");
    return;
  }

  const imagePrompt = `Illustration in fantasy art style: ${textDescription.substring(0, 500)}`;
  console.log(`画像生成を開始... Prompt: "${imagePrompt.substring(0, 50)}..."`);

  try {
    // --- ↓↓↓ 画像生成グラフを動的に作成 ↓↓↓ ---
    const dynamicImageGraphData = {
      version: 0.5,
      nodes: {
        // imagePromptNode は削除
        generateImage: {
          agent: "openaiImageAgent", // 画像生成エージェント
          params: {
             model: "dall-e-3",
             n: 1,
             size: "1024x1024",
             response_format: "b64_json" // ★ Base64 で受け取る場合
             // response_format: "url"    // ★ URL で受け取る場合
          },
          // ★★★ inputs.prompt に直接 imagePrompt を設定 ★★★
          inputs: { prompt: imagePrompt }
          
        },
        // isResult: true // ★★★ このノードを結果ノードにする ★★★
        // imageDataResult: { // 結果コピー用ノード
        //   agent: "copyAgent",
        //   // ↓↓↓ openaiImageAgent の出力形式に合わせる必要あり ↓↓↓
        //   inputs: { data: ":generateImage.result.data.$0.b64_json" }, // 例: Base64の場合
        //   // inputs: { data: ":generateImage.result.data.$0.url" }, // 例: URLの場合
        //   isResult: true
        // }
      }
    };
    console.log("--- Using Dynamic Image Graph Data ---");
    // --- ↑↑↑ 動的グラフ定義ここまで ↑↑↑ ---

    // グローバルな allAgents と 動的な画像グラフ定義を使う
    const imageGraph = new GraphAI(dynamicImageGraphData, allAgents);

    // run() に引数は不要
    const imageResult = await imageGraph.run();

    // --- ↓↓↓ imageResult の中身全体をログに出力 ↓↓↓ ---
    console.log("--- Full Image Graph Result (imageResult) ---");
    console.dir(imageResult, { depth: null }); // オブジェクトを詳細に表示
    console.log("-------------------------------------------");
    // --- ↑↑↑ ログ追加ここまで ↑↑↑ ---

    // ★★★ generateImage ノードの出力があるか確認 ★★★
    const agentRawOutput = imageResult?.generateImage; // キー名でアクセス

    if (agentRawOutput) {
      console.log("Raw output from generateImage node found:");
      console.dir(agentRawOutput, {depth: null}); // ★ エージェントの生の出力を表示

      // ★★★ ここで agentRawOutput の構造を見て、正しいパスを見つける ★★★
      // 例: もし { result: { data: [{ b64_json: "..." }] } } という構造なら:
      const b64_json = agentRawOutput?.result?.data?.[0]?.b64_json;

      if (b64_json) {
         console.log(`画像生成成功！ (b64_json found)`);
         const imageDataPayload = `data:image/png;base64,${b64_json}`;
         ws.send(JSON.stringify({ type: 'newImage', payload: { image: imageDataPayload } }));
         console.log(`生成された画像データを送信しました。`);
      } else {
         console.error("画像生成は成功したかもしれませんが、期待した形式のデータ(b64_json)が見つかりませんでした。");
         ws.send(JSON.stringify({ type: 'error', message: '画像データ形式エラー。' }));
      }
    } else {
      console.error(`画像生成ノード('generateImage')からの出力が見つかりませんでした。Result was empty or missing key.`);
      ws.send(JSON.stringify({ type: 'error', message: '画像の生成に失敗しました(Agent Output Missing)。' }));
    }
    // --- ↑↑↑ 結果処理ここまで ↑↑↑ ---

    // // 結果取得
    // const generatedImageData = imageResult.imageDataResult;

    // if (generatedImageData) {
    //   console.log(`画像生成成功！`);
    //   // response_format に合わせて Data URL または URL を作成
    //   const imageDataPayload = dynamicImageGraphData.nodes.generateImage.params.response_format === "b64_json"
    //                          ? `data:image/png;base64,${generatedImageData}`
    //                          : generatedImageData; // URLの場合はそのまま

    //   // ★ WebSocket でクライアントに 'newImage' イベントを送信 ★
    //   ws.send(JSON.stringify({ type: 'newImage', payload: { image: imageDataPayload } }));
    //   console.log(`生成された画像データを送信しました。`);
    // } else {
    //   console.error(`画像生成に失敗、または画像データがありませんでした。`);
    //   ws.send(JSON.stringify({ type: 'error', message: '画像の生成に失敗しました。' }));
    // }
  } catch (imageError) {
    console.error(`画像生成エラー:`, imageError);
    ws.send(JSON.stringify({ type: 'error', message: `画像生成中にエラーが発生しました: ${imageError.message}` }));
  }
}

// --- テキスト生成を実行し、その後非同期で画像生成をキックする関数 ---
async function handleUserInput(ws, userInputPayload) {
  console.log("ユーザー入力を処理中:", userInputPayload);
  try {
        // --- ↓↓↓ プロンプトに文字数制限の指示を追加 ↓↓↓ ---
        const requestPrompt = `あなたはテキストアドベンチャーゲームの進行役です。以下の入力に基づいて、次の場面と選択肢を、**自然な文章で140文字から240文字程度**にまとめて描写してください。\n\n入力: ${userInputPayload}`;
        console.log("--- LLMへのリクエストプロンプト (文字数制限付き) ---");
        console.log(requestPrompt);
        // --- ↑↑↑ プロンプト作成ここまで ↑↑↑ ---
    
    // 動的にグラフを作成し、プロンプトを直接埋め込む
    const dynamicTextGraphData = {
      version: 0.5,
      nodes: {
        chatLLM: {
          agent: "openAIAgent",
          params: { model: "gpt-4o" },
          // ★★★ 作成した指示付きプロンプトを使う ★★★
          inputs: { prompt: requestPrompt }
        },
        responseText: {
          agent: "copyAgent",
          inputs: { data: ":chatLLM.text" },
          isResult: true
        }
      }
    };
    console.log("--- Using Dynamic Graph Data with Length Constraint ---");

    const graph = new GraphAI(dynamicTextGraphData, allAgents);
    const result = await graph.run();
    const llmReply = result.responseText;

    // --- 結果を処理してクライアントに送信 ---
    if (llmReply) {
      console.log("LLMからの応答 (文字数制限されたはず):", llmReply.substring(0, 80) + "...");
      // テキスト応答をクライアントに送信
      ws.send(JSON.stringify({ type: 'newMessage', payload: { reply: llmReply } }));

      // ★★★ 文字数制限された応答を元に、非同期で画像生成を開始 ★★★
      //generateImageAsyncWithGraphAI(ws, llmReply);
      generateImageAsyncWithDirectOpenAI(ws, llmReply);


    } else {
      console.error("LLMからの応答が空でした。");
      ws.send(JSON.stringify({ type: 'error', message: 'AIからの応答がありませんでした。' }));
    }
    // --- ここまで結果処理 ---

  } catch (error) {
    console.error("GraphAI実行エラー:", error);
    ws.send(JSON.stringify({ type: 'error', message: `AI処理中にエラーが発生しました: ${error.message}` }));
  }
}

// --- サーバー起動 ---
server.listen(port, () => {
  console.log(`サーバー起動中 http://localhost:${port}/`);
  console.log('WebSocketサーバーも同じポートで待機中...');
});