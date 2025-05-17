"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Camera, Smartphone } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [connectionId, setConnectionId] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  // カメラストリームの開始（カメラ選択なしのシンプル版）
  const startCamera = async () => {
    try {
      // iOSデバイスでは、シンプルな制約を使用
      const constraints = {
        video: true,
        audio: false
      }

      // カメラへのアクセスを要求
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      localStreamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setError(null)
    } catch (err) {
      console.error("カメラの起動に失敗しました:", err)
      setError("カメラの起動に失敗しました。カメラへのアクセス権限を確認してください。")
    }
  }

  // WebRTC接続の開始
  const startStreaming = async () => {
    if (!connectionId) {
      setError("接続IDを入力してください。")
      return
    }

    if (!localStreamRef.current) {
      setError("カメラが起動していません。")
      return
    }

    try {
      // 既存の接続をリセット
      await fetch("/api/signaling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "reset", connectionId }),
      })

      // RTCPeerConnectionの作成
      const configuration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }
      const peerConnection = new RTCPeerConnection(configuration)
      peerConnectionRef.current = peerConnection

      // ローカルストリームの追加
      localStreamRef.current.getTracks().forEach((track) => {
        if (localStreamRef.current) {
          peerConnection.addTrack(track, localStreamRef.current)
        }
      })

      // ICE candidateの処理
      peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
          await fetch("/api/signaling", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "candidate",
              connectionId,
              payload: event.candidate,
            }),
          })
        }
      }

      // Offerの作成と送信
      const offer = await peerConnection.createOffer()
      await peerConnection.setLocalDescription(offer)

      await fetch("/api/signaling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "offer",
          connectionId,
          payload: offer,
        }),
      })

      // Answerの待機
      const checkAnswer = async () => {
        const response = await fetch("/api/signaling", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "get-answer", connectionId }),
        })

        const data = await response.json()

        if (data.answer) {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer))
          setIsStreaming(true)

          // ICE candidatesの取得と適用
          const candidatesResponse = await fetch("/api/signaling", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "get-candidates", connectionId }),
          })

          const candidatesData = await candidatesResponse.json()

          for (const candidate of candidatesData.candidates) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
          }
        } else {
          // Answerがまだない場合は再試行
          setTimeout(checkAnswer, 1000)
        }
      }

      checkAnswer()
    } catch (err) {
      console.error("ストリーミングの開始に失敗しました:", err)
      setError("ストリーミングの開始に失敗しました。")
    }
  }

  // ストリーミングの停止
  const stopStreaming = async () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }

    await fetch("/api/signaling", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "reset", connectionId }),
    })

    setIsStreaming(false)
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold text-center mb-8">iPadカメラストリーミング</h1>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>エラー</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            接続設定
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <label htmlFor="connectionId" className="text-sm font-medium">接続ID</label>
              <Input
                id="connectionId"
                placeholder="任意の接続IDを入力（例: camera1）"
                value={connectionId}
                onChange={(e) => setConnectionId(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">メインデバイスと同じ接続IDを使用してください</p>
            </div>

            <div className="flex flex-col gap-2">
              <Button onClick={startCamera}>
                カメラを起動
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            カメラプレビュー
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="aspect-video bg-black rounded-md overflow-hidden mb-4">
            <video ref={videoRef} className="w-full h-full object-contain" playsInline muted />
          </div>

          <div className="flex gap-2">
            {!isStreaming ? (
              <Button onClick={startStreaming} disabled={!localStreamRef.current || !connectionId} className="w-full">
                ストリーミング開始
              </Button>
            ) : (
              <Button onClick={stopStreaming} variant="destructive" className="w-full">
                ストリーミング停止
              </Button>
            )}
          </div>

          {isStreaming && (
            <p className="mt-4 text-center text-green-600 font-medium">
              ストリーミング中... メインデバイスで映像を確認してください
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}