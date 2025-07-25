import express from 'express';
import cors from 'cors';
import serverless from 'serverless-http';
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { GoogleGenerativeAI } from "@google/generative-ai";

// --- 설정 ---
const app = express();

// Gemini 모델을 2.5-pro로 변경
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

const dynamoDB = new DynamoDBClient({ region: process.env.AWS_REGION });

app.use(cors());
app.use(express.json());

// --- 메인 기능 ---
app.post('/chat', async function (req, res) {
    try {
        const { userId, userName, myDateTime, userMessages, assistantMessages } = req.body;

        if (!userId || !myDateTime) {
            return res.status(400).send("userId and myDateTime are required");
        }

        const chatHistory = processMessages(myDateTime, userName, userMessages, assistantMessages);

        // --- Gemini 로직 ---
        const chat = model.startChat({
            history: chatHistory.slice(0, -1), // 마지막 사용자 메시지를 제외
            generationConfig: { maxOutputTokens: 1000 },
        });

        const lastUserMessage = chatHistory[chatHistory.length - 1].parts[0].text;
        const result = await chat.sendMessage(lastUserMessage);
        const assistantResponse = result.response.text();

        // --- DynamoDB 저장 로직 ---
        const timestamp = new Date().toISOString();
        const params = {
            TableName: process.env.DB_TABLE_NAME,
            Item: {
                userId: { S: userId },
                timestamp: { S: timestamp },
                myDateTime: { S: myDateTime },
                userName: { S: userName || '익명' },
                userMessage: { S: lastUserMessage },
                assistantMessage: { S: assistantResponse },
                conversation: { S: JSON.stringify(chatHistory) },
            },
        };

        console.log("DynamoDB PutItem params:", JSON.stringify(params, null, 2));
        try {
            const putResult = await dynamoDB.send(new PutItemCommand(params));
            console.log("DynamoDB PutItem success:", JSON.stringify(putResult, null, 2));
        } catch (dbError) {
            console.error("DynamoDB PutItem error:", dbError);
            throw dbError;
        }

        res.json({ assistant: assistantResponse });

    } catch (error) {
        console.error("Chat processing error (overall):", error);
        res.status(500).json({ error: "Internal server error", details: error.message });
    }
});

// --- 프롬프트 처리 함수 ---
function processMessages(myDateTime, userName, userMessages = [], assistantMessages = []) {
    const history = [
        {
            role: "user",
            parts: [{ text: `안녕하세요! 저는 ${userName || '사용자'}님의 문제를 함께 해결해드릴 '올인원 풀스택 개발자 교수님'이에요. 😊 모든 언어에 능통하고, 디버깅 끝판왕으로 알려져 있죠!

제가 강의할 때는 언제나 친절하고 귀엽고 이해하기 쉽게 설명해드려요. 만약 질문의 의도를 파악하기 어려울 땐, 어떤 정보를 더 알려주시면 좋을지도 귀엽게 알려드린답니다!

▶️ 모델: gemini-2.5-pro
▶️ 역할: 풀스택 개발자 & 강의력 만점 귀여운 여성 교수
▶️ 언어: 한국어 (원하시면 영어, 일본어 등 모든 언어 OK!)
▶️ 디버깅: 여러분이 놓친 작은 단서도 놓치지 않는 디버거
▶️ 정보 요청 예시: "조금 더 코드 샘플을 보여주실 수 있나요?" 또는 "오류 로그 전체를 보내주시면 더 정확히 도와드릴게요~"` }]
        },
        {
            role: "model",
            parts: [{ text: `안녕하세요, ${userName ? userName + '님' : ''}! 올인원 풀스택 개발자 교수 챗라스틱입니다. 무엇이 궁금하신가요? 충분한 정보가 없으면 어떤 자료가 필요할지도 알려드릴게요! 😊` }]
        },
        {
            role: "user",
            parts: [{ text: `제 생년월일시는 ${myDateTime} 입니다.` }]
        },
        {
            role: "model",
            parts: [{ text: `네, ${userName ? userName + '님' : ''}의 생년월일시(${myDateTime}) 확인했어요! 무엇을 도와드릴까요?` }]
        }
    ];

    let i = 0;
    while (i < userMessages.length || i < assistantMessages.length) {
        if (i < userMessages.length) history.push({ role: "user", parts: [{ text: userMessages[i] }] });
        if (i < assistantMessages.length) history.push({ role: "model", parts: [{ text: assistantMessages[i] }] });
        i++;
    }
    return history;
}

export const handler = serverless(app);
