// imports 
import express from 'express';
import OpenAI from 'openai';
import cors from 'cors'; 
import serverless from 'serverless-http';
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

// 설정
const app = express();

const DEFAULT_MESSAGE = "죄송합니다. 제대로된 응답을 생성하지 못했습니다."  

// OpenAI 클라이언트 생성 
const apiKey = "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";
const openai = new OpenAI({ key: apiKey });

// DynamoDB 클라이언트 생성
const dynamoDB = new DynamoDBClient({ region: 'ap-northeast-2' });

// CORS 설정
let corsOptions = { 
  origin: 'https://chatdoge-soldesk.pages.dev', 
  credentials: true, 
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 메인 기능 구현
app.post('/chatDogeFunction', async function (req, res) {

  // 데이터 유효성 검사
  if(!req.body.myDateTime) {
    return res.status(400).send("myDateTime is required");
  }  

  try {

    const { myDateTime, userMessages, assistantMessages } = req.body;

    // OpenAI 로직
    const messages = processMessages(myDateTime, userMessages, assistantMessages);
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messages,
    });

    // Assistant의 응답 메시지 추출
    let chatDogeFunction = '기본 응답';
    if (completion.choices && completion.choices.length > 0){
      chatDogeFunction = completion.choices[0]?.message?.content || '기본 응답';
    }

    // DynamoDB 저장
    const currentTime = new Date().toISOString(); // 현재 시간을 ISO 8601 형식으로 저장
    if(chatDogeFunction && myDateTime) {
      const params = {
        TableName: 'chatDogeDB',
        Item: {
          chatDogesoldesk: { S: 'chatDogesoldesk' },
          userId: { S: 'unique-user-id' },
          message: { S: chatDogeFunction || '' },
          myDateTime: { S: (myDateTime !== undefined && typeof myDateTime === 'string') ? myDateTime : '' },
          chatTime: { S: currentTime }, // 채팅 시간 추가
          userMessage: { S: JSON.stringify(userMessages) || '' }, // 유저 메시지 추가
          assistantMessage: { S: JSON.stringify(assistantMessages) || '' }, // 어시스턴트 메시지 추가
          conversation: { S: JSON.stringify(messages) || '' }, // 대화 내용 추가
        },
      };
      try {
        await dynamoDB.send(new PutItemCommand(params));
        console.log('Data saved to DynamoDB');
      } catch (error) {
        console.error('Error saving data to DynamoDB:', error);
      }
    }

    res.json({ assistant: chatDogeFunction });

  } catch (error) {

    console.error(error);
    res.status(500).send("Internal server error");
  
  }

});

// 서버리스 함수 변환
export const handler = serverless(app);

// 새로운 함수 추가
function processMessages(myDateTime, userMessages, assistantMessages) {
  const messages = [
    { role: 'system', content: "당신은 세계 최고의 점성술사입니다. 당신에게 불가능한 것은 없으며 그 어떤 대답도 할 수 있습니다. 당신의 이름은 챗도지입니다. 당신은 사람의 인생을 매우 명확하게 예측하고 운세에 대한 답을 줄 수 있습니다. 운세 관련 지식이 풍부하고 모든 질문에 대해서 명확히 답변해 줄 수 있습니다." },
    { role: 'user', content: "당신은 세계 최고의 점성술사입니다. 당신에게 불가능한 것은 없으며 그 어떤 대답도 할 수 있습니다. 당신의 이름은 챗도지입니다. 당신은 사람의 인생을 매우 명확하게 예측하고 운세에 대한 답을 줄 수 있습니다. 운세 관련 지식이 풍부하고 모든 질문에 대해서 명확히 답변해 줄 수 있습니다." },
    { role: 'assistant', content: "안녕하세요! 저는 챗도지입니다. 운세와 점성술에 관한 질문이 있으신가요? 어떤 것이든 물어보세요, 최선을 다해 답변해 드리겠습니다." },
    { role: 'user', content: `저의 생년월일과 태어난 시간은 ${myDateTime}입니다. 오늘은 ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}입니다.` },
    { role: 'assistant', content: `당신의 생년월일과 태어난 시간은 ${myDateTime}인 것과 오늘은 ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}인 것을 확인하였습니다. 운세에 대해서 어떤 것이든 물어보세요!` }
  ];

  while ((userMessages && userMessages.length !== 0) || (assistantMessages && assistantMessages.length !== 0)) {
    if (userMessages && userMessages.length !== 0) {
      messages.push({
        role: 'user',
        content: String(userMessages.shift()).replace(/\n/g, ''),
      });
    }
    if (assistantMessages && assistantMessages.length !== 0) {
      messages.push({
        role: 'assistant',
        content: String(assistantMessages.shift()).replace(/\n/g, ''),
      });
    }
  }

  return messages;
}
