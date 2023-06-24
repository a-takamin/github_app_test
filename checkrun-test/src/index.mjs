import crypto from "crypto"
import jwt from "jsonwebtoken"
import https from "https"
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm"

export const handler = async (event, context) => {
  const webhook_secret = await getSSMParameter(process.env.WEBHOOK_SECRET)
  const github_app_id = await getSSMParameter(process.env.GITHUB_APP_ID)
  const github_app_private_key = await getSSMParameter(process.env.GITHUB_APP_PRIVATE_KEY)

  // まずは、GitHub App Webhookの認証を行う
  const signature = event.headers["x-hub-signature-256"]
  verify_signature(signature, event.body, webhook_secret)

  // 次に、installation access tokenの発行を行う
  const installation_id = JSON.parse(event.body).installation.id
  const jwtoken = await create_jwt(github_app_id, github_app_private_key)

  let resp = ""
  try { // .then().catch()ではなくawaitを使おうと思うので、try-catchでエラーをキャッチする
    resp = await get_installation_access_token(installation_id, jwtoken)
  } catch (e) {
    console.error(e)
  }
  const inst_access_token = JSON.parse(resp).token

  // 最後に、GitHub APIを叩いて、Check Runsを作成する


}

const verify_signature = (signature, body, secret) => {
  const digest = crypto.createHmac("sha256", secret)
    .update(body)
    .digest("hex")
  const checksum = `sha256=${digest}`
  if (checksum !== signature) {
    throw new Error("signature does not match")
  }
}

const create_jwt = async (app_id, private_key) => {
  const payload = {
    iat: Math.floor(Date.now() / 1000) - (60 * 1), // 時間のズレを考慮して1分前(公式推奨)
    exp: Math.floor(Date.now() / 1000) + (60 * 3), // 3 mins
    iss: app_id
  }
  // GitHub側が公開鍵を持っているので、秘密鍵で署名する
  return await jwt.sign(payload, private_key, { algorithm: "RS256" }) 
}

const get_installation_access_token = (installation_id, jwtoken) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      port: 443,
      path: `/app/installations/${installation_id}/access_tokens`,
      method: "POST",
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "checkrun-test", // 必須。https://docs.github.com/en/rest/overview/resources-in-the-rest-api#user-agent-required
        "X-Github-Api-Version": "2022-11-28",
        "Authorization": `Bearer ${jwtoken}`,
        "installation_id": installation_id,
      }
    }
  
    const req = https.request(options, (res) => {
      let body = ""
      res.on("data", (d) => {
        body += d
      })
      res.on("error", (e) => {
        reject(e)
      })
      res.on("end", () => {
        resolve(body) // コールバック内のここでPromiseが解決される
      })
    })
  
    req.end() // ここでリクエストが送信される
  })
  
}

const getSSMParameter = async (path) => {
  const ssm = new SSMClient()
  const command = new GetParameterCommand({ Name: path, WithDecryption: true })
  const response = await ssm.send(command)
  return response.Parameter.Value
}