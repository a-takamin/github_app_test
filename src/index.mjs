import crypto from "crypto"
import jwt from "jsonwebtoken"
import https from "https"
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm"

class GhEvent {
  async handle_action(action, body) {
    throw new Error("this class should be implemented")
  }
}

class NotHandleGhEvent extends GhEvent {
  // @Override
  async handle_action(action, body) {
    return
  }
}

class CheckSuiteGhEvent extends GhEvent {
  constructor() {
    super()
    this.actions = {
      requested: new CheckSuiteRequestedAction(),
    }
  }

  // @Override
  async handle_action(action, body) {
    if (action in this.actions) {
      await this.actions[action].handle(body)
      return
    }
    console.log(`${action} in check_suit event is not handled in this app.`)
  }
}

class CheckRunGhEvent extends GhEvent {
  constructor() {
    super()
    this.actions = {
      requested_action: new CheckRunRequestedAction(),
    }
  }

  // @Override
  async handle_action(action, body) {
    if (action in this.actions) {
      await this.actions[action].handle(body)
      return
    }
    console.log(`${action} in check_run event is not handled in this app.`)
  }
}

class GhEventMapper {
  constructor() {
    this.gh_events = {
      check_suite: new CheckSuiteGhEvent(),
      check_run: new CheckRunGhEvent(),
    }
  }

  get_event(gh_event) {
    if (gh_event in this.gh_events) {
      return this.gh_events[gh_event]
    }
    return new NotHandleGhEvent()
  }
}

class GhAction {
  async handle(body) {
    throw new Error("Not implemented")
  }
}

class CheckSuiteRequestedAction extends GhAction {
  // @Override
  async handle(body) {
    // installation access token(特定のGitHub API操作トークン)の発行を行う
    const installation_id = body.installation.id
    const jwtoken = await create_jwt()
    const inst_access_token = await get_installation_access_token(installation_id, jwtoken)

    // GitHub APIを叩いて、Check Runsを作成する
    const owner = body.repository.owner.login
    const repo = body.repository.name
    const head_sha = body.check_suite.head_sha
    console.log(`owner: ${owner}, repo: ${repo}, head_sha: ${head_sha}`)
    try {
      const resp = await this.create_check_run(inst_access_token, owner, repo, head_sha)
      console.log(resp)
    } catch (e) {
      console.error(e)
    }
  }

  async create_check_run(inst_access_token, owner, repo, commit_sha) {
    const body = JSON.stringify({
      name: "checkrun-test",
      head_sha: commit_sha, // コミットのSHA
      details_url: "https://docs.github.com/en/rest/checks/runs", // このChecksの詳細ページのURL
      external_id: "xid-123", // ?
      status: "completed", // queued, in_progress, completed
      started_at: new Date().toISOString(),
      conclusion: "action_required", // success, failure, neutral, cancelled, timed_out, action_required, stale
      completed_at: new Date().toISOString(),
      output: {
        title: "テストチェックラン！！",
        summary: "これはただのチェックランのテスト（action_required）です",
        text: "チェックランとGitHub Appの勉強のために作りました",
        annotations: [
          {
            path: "README.md",
            start_line: 1,
            end_line: 1,
            start_column: 1,
            end_column: 5,
            annotation_level: "failure", // notice, warning, failure
            message: "README.mdに関するアノテーションです。<br>レベルをfailureにしています",
            title: "アノテーションのタイトル",
            raw_details: "README.mdに関するアノテーションです。<br>レベルをfailureにしています",
          },
        ],
        images: [
          {
            alt: "this is a checkrun test image alt",
            image_url:
              "https://avatars.githubusercontent.com/u/47934741?s=400&u=319f1477b25500f3b797f426a989a01304c38f20&v=4",
            caption: "this is a checkrun test image caption",
          },
        ],
      },
      actions: [
        {
          label: "click to fix",
          description: "This is test. Click, and Solved!",
          identifier: "action-1",
        },
      ],
    })

    const options = {
      hostname: "api.github.com",
      port: 443,
      path: `/repos/${owner}/${repo}/check-runs`,
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "checkrun-test",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${inst_access_token}`,
      },
    }
    return send_req(options, body)
  }
}

class CheckRunRequestedAction extends GhAction {
  // @Override
  async handle(body) {
    // installation access token(特定のGitHub API操作トークン)の発行を行う
    const installation_id = body.installation.id
    const jwtoken = await create_jwt()
    const inst_access_token = await get_installation_access_token(installation_id, jwtoken)

    // GitHub APIを叩いて、Check Runsを更新する
    const owner = body.repository.owner.login
    const repo = body.repository.name
    const check_run_id = body.check_run.id

    try {
      const resp = await this.update_check_run(inst_access_token, owner, repo, check_run_id)
      console.log(resp)
    } catch (e) {
      console.error(e)
    }
  }

  async update_check_run(inst_access_token, owner, repo, check_run_id) {
    const body = JSON.stringify({
      conclusion: "success", // success, failure, neutral, cancelled, timed_out, action_required, stale
      output: {
        title: "テストチェックラン！！",
        summary: "これはただのチェックランのテスト（success）です",
        text: "チェックランとGitHub Appの勉強のために作りました",
      },
    })

    const options = {
      hostname: "api.github.com",
      port: 443,
      path: `/repos/${owner}/${repo}/check-runs/${check_run_id}`,
      method: "PATCH",
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "checkrun-test",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${inst_access_token}`,
      },
    }
    return send_req(options, body)
  }
}

const verify_signature = (signature, body, secret) => {
  const digest = crypto.createHmac("sha256", secret).update(body).digest("hex")
  const checksum = `sha256=${digest}`
  if (checksum !== signature) {
    throw new Error("signature does not match")
  }
}

const create_jwt = async () => {
  const app_id = await getSSMParameter(process.env.GITHUB_APP_ID)
  const private_key = await getSSMParameter(process.env.GITHUB_APP_PRIVATE_KEY)
  const payload = {
    iat: Math.floor(Date.now() / 1000) - 60 * 1, // 時間のズレを考慮して1分前(公式推奨)
    exp: Math.floor(Date.now() / 1000) + 60 * 3, // 3 mins
    iss: app_id,
  }
  // GitHub側が公開鍵を持っているので、秘密鍵で署名する
  // returnの場合はawaitをつけなくて良い
  return jwt.sign(payload, private_key, { algorithm: "RS256" })
}

const get_installation_access_token = async (installation_id, jwtoken) => {
  const options = {
    hostname: "api.github.com",
    port: 443,
    path: `/app/installations/${installation_id}/access_tokens`,
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "checkrun-test", // 必須。https://docs.github.com/en/rest/overview/resources-in-the-rest-api#user-agent-required
      "X-Github-Api-Version": "2022-11-28",
      Authorization: `Bearer ${jwtoken}`,
      installation_id: installation_id,
    },
  }
  try {
    const res = await send_req(options, "")
    return JSON.parse(res).token
  } catch (e) {
    console.error(e)
  }
  return ""
}

const send_req = async (options, body) => {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      console.log(`${options.path} Status Code: ${res.statusCode}`)
      let resp_data = "" // initialized as string
      res.on("data", (chunk) => {
        resp_data += chunk
      })
      res.on("error", (e) => {
        reject(e)
      })
      res.on("end", () => {
        try {
          resolve(resp_data) // コールバック内のここでPromiseが解決される
        } catch (e) {
          reject(e)
        }
      })
    })

    // リクエスト自体のエラーの場合
    req.on("error", (e) => {
      reject(e)
    })

    if (body) {
      req.write(body)
    }
    req.end() // ここでリクエストが送信される
  })
}

const getSSMParameter = async (path) => {
  const ssm = new SSMClient()
  const command = new GetParameterCommand({ Name: path, WithDecryption: true })
  const response = await ssm.send(command)
  return response.Parameter.Value
}

export const handler = async (event) => {
  const webhook_secret = await getSSMParameter(process.env.WEBHOOK_SECRET)
  const raw_body = event.body
  const body = JSON.parse(event.body)

  // GitHub App Webhookの認証を行う
  const signature = event.headers["x-hub-signature-256"]
  verify_signature(signature, raw_body, webhook_secret)

  // eventとactionに応じて処理を振り分ける
  const gh_event = event.headers["x-github-event"]
  const gh_action = body.action
  console.log(`gh_event: ${gh_event}, gh_action: ${gh_action}`)

  await new GhEventMapper().get_event(gh_event).handle_action(gh_action, body)
}
