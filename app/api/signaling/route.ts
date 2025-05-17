import { NextResponse } from "next/server"

// シグナリングサーバーの状態を保持する簡易的なメモリストレージ
// 注意: 本番環境では Redis などの外部ストレージを使用することをお勧めします
const connections: {
  [id: string]: {
    offer?: RTCSessionDescriptionInit
    answer?: RTCSessionDescriptionInit
    candidates: RTCIceCandidateInit[]
  }
} = {}

export async function POST(request: Request) {
  const data = await request.json()
  const { type, connectionId, payload } = data

  // 接続IDがない場合は初期化
  if (!connections[connectionId]) {
    connections[connectionId] = { candidates: [] }
  }

  switch (type) {
    case "offer":
      connections[connectionId].offer = payload
      break
    case "answer":
      connections[connectionId].answer = payload
      break
    case "candidate":
      connections[connectionId].candidates.push(payload)
      break
    case "get-offer":
      return NextResponse.json({ offer: connections[connectionId]?.offer || null })
    case "get-answer":
      return NextResponse.json({ answer: connections[connectionId]?.answer || null })
    case "get-candidates":
      return NextResponse.json({ candidates: connections[connectionId]?.candidates || [] })
    case "reset":
      connections[connectionId] = { candidates: [] }
      return NextResponse.json({ success: true })
    default:
      return NextResponse.json({ error: "Invalid type" }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
