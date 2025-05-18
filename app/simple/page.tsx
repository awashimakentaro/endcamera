"use client"

import { useRef, useState } from "react"

export default function SimpleCameraTest() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState("待機中")

  const startCamera = async () => {
    setStatus("カメラアクセスを要求中...")

    try {
      // ブラウザがMediaDevices APIをサポートしているか確認
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatus("エラー: このブラウザはMediaDevices APIをサポートしていません")
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setStatus("カメラアクセス成功！")
      }
    } catch (error: unknown) {
      // エラーオブジェクトの型を適切に処理
      console.error("カメラエラー:", error)

      // エラーメッセージの取得方法を改善
      let errorMessage = "カメラアクセスに失敗しました"
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === "string") {
        errorMessage = error
      } else if (error && typeof error === "object" && "message" in error) {
        errorMessage = String(error.message)
      }

      setStatus(`エラー: ${errorMessage}`)
    }
  }

  return (
    <div className="p-8 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-6">シンプルカメラテスト</h1>

      <div className="mb-4 p-4 bg-gray-100 rounded">
        <p>
          <strong>ステータス:</strong> {status}
        </p>
      </div>

      <div className="aspect-video bg-black rounded-md overflow-hidden mb-6">
        <video ref={videoRef} className="w-full h-full object-contain" playsInline muted />
      </div>

      <button className="w-full py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600" onClick={startCamera}>
        カメラを起動
      </button>

      <div className="mt-6 text-sm text-gray-600">
        <p>注意: iOSデバイスではHTTPSでのみカメラアクセスが許可されます。</p>
      </div>
    </div>
  )
}
