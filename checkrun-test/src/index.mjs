import crypto from "crypto"
import fs from "fs"
import jwt from "jsonwebtoken"
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm"

export const handler = async (event, context) => {
  const webhook_secret = await getSSMParameter(process.env.WEBHOOK_SECRET)
  const github_app_id = await getSSMParameter(process.env.GITHUB_APP_ID)
  const github_app_pem = await getSSMParameter(process.env.GITHUB_APP_PRIVATE_KEY)

  // まずは、GitHub App Webhookの認証を行う
  const signature = event.headers["x-hub-signature-256"]
  // verify_signature(signature, JSON.stringify(event.body), webhook_secret)
  verify_signature(signature, event.body, webhook_secret)

  // 次に、installation tokenの発行を行う
  const jwtoken = await create_jwt(github_app_id, github_app_private_key)
  const installation_id = event.body.installation.id

  // 最後に、GitHub APIを叩いて、Check Runsを作成する
  return ""
}

const verify_signature = (signature, body, secret) => {
  const digest = crypto.createHmac("sha256", secret)
    .update(body)
    .digest("hex")
  const checksum = `sha256=${digest}`
  console.log("body", body)
  console.log("checksum", checksum)
  console.log("signature", signature)
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

const getSSMParameter = async (path) => {
  const ssm = new SSMClient()
  const command = new GetParameterCommand({ Name: path, WithDecryption: true })
  const response = await ssm.send(command)
  return response.Parameter.Value
}