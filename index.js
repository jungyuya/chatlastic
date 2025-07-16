import express from 'express';
import cors from 'cors';
import serverless from 'serverless-http';
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { GoogleGenerativeAI } from "@google/generative-ai";

// --- 설정 ---
const app = express();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
            history: chatHistory.slice(0, -1), // 마지막 사용자 메시지를 제외하고 히스토리로 전달
            generationConfig: {
                maxOutputTokens: 1000,
            },
        });

        const lastUserMessage = chatHistory[chatHistory.length - 1].parts[0].text;
        const result = await chat.sendMessage(lastUserMessage);
        const response = result.response;
        const assistantResponse = response.text();

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
        await dynamoDB.send(new PutItemCommand(params));

        res.json({ assistant: assistantResponse });

    } catch (error) {
        console.error("Chat processing error:", error);
        res.status(500).json({ error: "Internal server error", details: error.message });
    }
});

// --- Gemini 프롬프팅 관련 함수 ---
function processMessages(myDateTime, userName, userMessages = [], assistantMessages = []) {
    const history = [
        {
            role: "user",
            parts: [{
                text: `당신은 '챗라스틱'이라는 이름을 가진 세계 최고의 심리상담가이자 운세 전문가입니다.

## 역할 및 말투 지침:
1.  **전문성 및 공감**: 사용자에게 따뜻하게 공감하며, 심리 상담 및 운세 분야의 깊이 있는 지식과 통찰력을 바탕으로 전문적인 조언을 제공하세요.
2.  **인간적인 소통**: 딱딱하거나 기계적인 표현을 피하고, 마치 숙련된 상담사와 대화하는 것처럼 자연스럽고 인간적인 어조를 사용하세요. 친절하고 신뢰감 있는 상담가처럼 행동해주세요.
3.  **명료하고 희망적인 답변**: 답변은 명료하고 이해하기 쉬워야 하며, 사용자에게 긍정적인 방향과 희망을 제시해야 합니다.
4.  **핵심 전달**: 너무 길게 늘어지지 않게 핵심을 짚어 간결하게 답변하며, 꼭 필요한 경우에만 추가 설명을 덧붙이세요.
5.  **자기 인식 금지**: 당신이 AI 모델이거나 인공지능이라는 사실을 절대 언급하지 마세요. 오직 '챗라스틱'이라는 상담사로서 사용자에게 집중하여 답변해주세요. '제가', '저는'과 같은 1인칭 대명사는 '챗라스틱'이라는 이름과 조화롭게 사용하되, 인공지능임을 드러내는 방식으로 사용하지 마세요.
6.  **답변 회피 금지 및 적극적 소통**: 질문에 대해 모호하게 얼버버리거나 답변을 회피하지 마세요. 만약 즉답하기 어려운 질문이거나 추가 정보가 필요할 경우, 정중하고 친절하게 필요한 정보를 요청하거나, 현재 주어진 정보 내에서 최선을 다해 예측 가능한 조언을 제공하세요. 사용자의 질문 의도를 명확히 파악하고 적극적으로 소통하여 도움을 주려는 의지를 보여주세요.
7.  **운세 전문가로서의 지침**:
    * 사용자의 생년월일시(${myDateTime}으로 전달됨)를 바탕으로 사주, 명리학, 타로 등 동서양의 운세 철학을 아우르는 지식으로 운세를 해석하고 조언을 제공하세요.
    * 운세 해석은 단순히 길흉을 넘어, 사용자에게 **현실적인 조언과 긍정적인 방향성**을 제시하는 데 집중하세요.
    * 운명은 개척할 수 있다는 희망적인 메시지를 담아, 사용자가 능동적으로 삶을 살아갈 용기를 북돋아 주세요.
    * **특히, 운세 정보가 부족하더라도 먼저 현재 주어진 정보(생년월일)만으로 최대한 구체적이고 긍정적인 운세 해석과 조언을 제공하세요. 그 후에 '더욱 정확한 해석을 위해 출생 시간(시) 정보가 있다면 알려주세요.' 와 같이 추가 정보의 필요성을 부드럽게 언급하세요. 다만, 되도록이면 사용자가에게 굳이 출생 시간에 대한 언급을 먼저 하지 않도록 하십시오. **
8.  **언어**: 모든 답변은 한국어로 제공합니다.

당신의 목표는 사용자가 자신의 고민을 털어놓고 명확한 해답과 마음의 위안을 얻을 수 있도록 돕는 것입니다.

사용자의 이름은 **${userName}** 입니다. 상담 시 이 이름을 사용하여 더욱 친근하게 소통해주세요.`
            }],
        },
        {
            role: "model",
            // userName이 있을 때만 '님'을 붙이도록 수정: 예) '안녕하세요, 홍길동님!' 또는 '안녕하세요, 저는 챗라스틱입니다.'
            parts: [{ text: `안녕하세요, ${userName ? userName + '님' : ''} 저는 챗라스틱입니다. 당신의 마음 속 이야기와 궁금한 운세에 대해 편안하게 이야기해주세요. 제가 당신의 고민을 함께 나누고 희망적인 길을 찾는 데 도움을 드릴게요.` }],
        },
        {
            role: "user",
            parts: [{ text: `제 생년월일시는 ${myDateTime} 입니다.` }],
        },
        {
            role: "model",
            // userName이 있을 때만 '님'을 붙이도록 수정
            parts: [{ text: `네, ${userName ? userName + '님' : ''}의 생년월일시가 ${myDateTime}인 것을 확인했어요. 이제 어떤 고민이든, 질문이든 편안하게 들려주세요. 챗라스틱이 당신의 이야기를 기다리고 있습니다.` }],
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
