import "dotenv/config";
import { graphDataTestRunner } from "@receptron/test_utils";
import * as agents from "@graphai/agents";

//const query =
//  "I'd like to write a paper about data flow programming for AI application, which involves multiple asynchronous calls, some of operations are done on other machines (distributed computing). Please come up with the title and an abstract for this paper.";

const query ="テキストアドベンチャーを初めてください"

const graph_data = {
  version: 0.5,
  nodes: {
    query: {
//      agent: "groqAgent",
      agent: "openaiAgent",
  params: {
//    model: "mixtral-8x7b-32768",
    model: "gpt-4o",
  },
      isResult: true,
      inputs: {
        prompt: query,
      },
    },
    answer: {
      agent: "copyAgent",
      params: { namedKey: "text" },
      inputs: { text: ":query.text" },
    },
  },
};

export const main = async () => {
      const result = await graphDataTestRunner(__dirname + "/../", __filename, graph_data, agents);
      console.log("Graph execution result status:", result);
      console.log("\nFull Graph Result Object (dir):");
      console.dir(result, { depth: null });
      console.log("\nLLM Response (result.answer):");
      console.log(result.answer);
      console.log("\nTrying result?.answer as string:"); // string 型として直接出力してみる
      console.log(typeof result?.answer === 'string' ? result.answer : 'result?.answer is not a string');
  };


if (process.argv[1] === __filename) {
  main();
}
