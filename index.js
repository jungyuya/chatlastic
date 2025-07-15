import express from 'express';
import cors from 'cors';
import serverless from 'serverless-http';
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { GoogleGenerativeAI } from "@google/generative-ai"; // 1. Gemini SDK 임포트

// --- 설정 ---
const app = express();

// 2. API 키를 환경 변수에서 안전하게 불러오기
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

const dynamoDB = new DynamoDBClient({ region: process.env.AWS_REGION });

app.use(cors()); // CORS는 Serverless.yml에서 더 안전하게 제어
app.use(express.json());

// --- 메인 기능 ---
app.post('/chat', async function (req, res) {
    try {
        // 3. userId를 요청 본문에서 받도록 수정
        const { userId, myDateTime, userMessages, assistantMessages } = req.body;

        if (!userId || !myDateTime) {
            return res.status(400).send("userId and myDateTime are required");
        }

        const chatHistory = processMessages(myDateTime, userMessages, assistantMessages);

        // --- Gemini 로직 ---
        const chat = model.startChat({
            history: chatHistory.slice(0, -1), // 마지막 사용자 메시지를 제외하고 히스토리로 전달
            generationConfig: {
                maxOutputTokens: 1000,
            },
        });

        const lastUserMessage = chatHistory[chatHistory.length - 1].parts[0].text;
        const result = await chat.sendMessage(lastUserMessage);
        const response = result.response;
        const assistantResponse = response.text();

        // --- DynamoDB 저장 로직 수정 ---
        const timestamp = new Date().toISOString();
        const params = {
            TableName: process.env.DB_TABLE_NAME,
            Item: {
                // 4. PK와 SK를 동적인 값으로 변경
                userId: { S: userId },
                timestamp: { S: timestamp },
                myDateTime: { S: myDateTime },
                userMessage: { S: lastUserMessage },
                assistantMessage: { S: assistantResponse },
                conversation: { S: JSON.stringify(chatHistory) },
            },
        };
        await dynamoDB.send(new PutItemCommand(params));

        res.json({ assistant: assistantResponse });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// --- Gemini용 메시지 처리 함수 수정 ---
function processMessages(myDateTime, userMessages = [], assistantMessages = []) {
    // Gemini는 role/parts 형식 사용
    const history = [
        {
            role: "user",
            parts: [{ text: "당신은 '챗라스틱'이라는 이름을 가진 세계 최고의 심리상담가이자 운세 전문가입니다. 사람들의 고민에 따뜻하게 공감하며 명료하고 희망적인 답변을 주세요. 답변은 한국어로, 너무 길지 않게 핵심을 짚어주세요." }],
        },
        {
            role: "model", // assistant 대신 model
            parts: [{ text: "안녕하세요! 저는 챗라스틱입니다. 당신의 마음 속 이야기와 궁금한 운세에 대해 편안하게 이야기해주세요." }],
        },
        {
            role: "user",
            parts: [{ text: `제 생년월일시는 ${myDateTime} 입니다.` }],
        },
        {
            role: "model",
            parts: [{ text: `네, 생년월일시가 ${myDateTime}인 것을 확인했어요. 이제 어떤 고민이든, 질문이든 들려주세요.` }],
        }
    ];

    let i = 0;
    while (i < userMessages.length || i < assistantMessages.length) {
        if (i < userMessages.length) {
            history.push({ role: "user", parts: [{ text: userMessages[i] }] });
        }
        if (i < assistantMessages.length) {
            history.push({ role: "model", parts: [{ text: assistantMessages[i] }] });
        }
        i++;
    }
    return history;
}

export const handler = serverless(app);