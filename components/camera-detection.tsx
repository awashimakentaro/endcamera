"use client"

import { useRef, useState, useEffect } from "react"
import * as tf from "@tensorflow/tfjs"
import * as cocossd from "@tensorflow-models/coco-ssd"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertCircle, Camera, Smartphone, Video } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function CameraDetection() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [model, setModel] = useState<cocossd.ObjectDetection | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [peopleCount, setPeopleCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [detectedObjects, setDetectedObjects] = useState<{ [key: string]: number }>({})
  const [connectionId, setConnectionId] = useState("")
  const [,setCameraMode] = useState<"local" | "remote">("local")
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)

  // 検出された人のIDを追跡
  const detectedPeopleRef = useRef<Set<string>>(new Set())

  // モデルの読み込み
  useEffect(() => {
    const loadModel = async () => {
      try {
        await tf.ready()
        const loadedModel = await cocossd.load()
        setModel(loadedModel)
        console.log("モデルが読み込まれました")
      } catch (err) {
        console.error("モデルの読み込みに失敗しました:", err)
        setError("AIモデルの読み込みに失敗しました。ページを再読み込みしてください。")
      }
    }

    loadModel()

    return () => {
      // クリーンアップ
      stopCamera()
    }
  }, [])

  // ローカルカメラの開始
  const startLocalCamera = async () => {
    if (!model) {
      setError("モデルがまだ読み込まれていません。しばらくお待ちください。")
      return
    }

    try {
      const constraints = {
        video: {
          width: 640,
          height: 480,
        },
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
        setIsRunning(true)
        setError(null)
        detectFrame()
      }
    } catch (err) {
      console.error("カメラへのアクセスに失敗しました:", err)
      setError("カメラへのアクセスに失敗しました。カメラの権限を確認してください。")
    }
  }

  // リモートカメラの開始（iPhone/iPad）
  const startRemoteCamera = async () => {
    if (!model) {
      setError("モデルがまだ読み込まれていません。しばらくお待ちください。")
      return
    }

    if (!connectionId) {
      setError("接続IDを入力してください。")
      return
    }

    try {
      // RTCPeerConnectionの作成
      const configuration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }
      const peerConnection = new RTCPeerConnection(configuration)
      peerConnectionRef.current = peerConnection

      // リモートストリームの処理
      peerConnection.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0]
          videoRef.current.play()
          setIsRunning(true)
          detectFrame()
        }
      }

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

      // Offerの取得
      const response = await fetch("/api/signaling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "get-offer", connectionId }),
      })

      const data = await response.json()

      if (!data.offer) {
        setError(
          "iPhoneまたはiPad Proからのストリーミングが見つかりません。カメラページでストリーミングを開始してください。",
        )
        return
      }

      // リモート説明の設定
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer))

      // Answerの作成と送信
      const answer = await peerConnection.createAnswer()
      await peerConnection.setLocalDescription(answer)

      await fetch("/api/signaling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "answer",
          connectionId,
          payload: answer,
        }),
      })

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

      setError(null)
    } catch (err) {
      console.error("リモートカメラの接続に失敗しました:", err)
      setError("リモートカメラの接続に失敗しました。接続IDを確認してください。")
    }
  }

  // カメラの停止
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      const tracks = stream.getTracks()
      tracks.forEach((track) => track.stop())
      videoRef.current.srcObject = null
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }

    setIsRunning(false)

    // キャンバスをクリア
    const ctx = canvasRef.current?.getContext("2d")
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    }
  }

  // フレームごとの検出処理
  const detectFrame = async () => {
    if (!model || !videoRef.current || !canvasRef.current || !isRunning) return

    try {
      const predictions = await model.detect(videoRef.current)

      const ctx = canvasRef.current.getContext("2d")
      if (!ctx) return

      // キャンバスのサイズをビデオに合わせる
      canvasRef.current.width = videoRef.current.videoWidth
      canvasRef.current.height = videoRef.current.videoHeight

      // キャンバスをクリア
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)

      // ビデオフレームを描画
      ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height)

      // 検出結果を集計
      const objectCounts: { [key: string]: number } = {}

      // 新しく検出された人を追跡
      predictions.forEach((prediction) => {
        const { class: objectClass, score, bbox } = prediction

        // スコアが0.5以上の場合のみ処理
        if (score >= 0.5) {
          // オブジェクトのカウントを更新
          objectCounts[objectClass] = (objectCounts[objectClass] || 0) + 1

          // 人が検出された場合
          if (objectClass === "person") {
            // 検出された人の位置に基づいてユニークIDを生成
            const personId = `${Math.round(bbox[0])}-${Math.round(bbox[1])}`

            // まだカウントされていない人の場合
            if (!detectedPeopleRef.current.has(personId)) {
              detectedPeopleRef.current.add(personId)
              setPeopleCount((prev) => prev + 1)

              // 一定時間後にIDを削除（同じ人が再度カウントされるのを防ぐため）
              setTimeout(() => {
                detectedPeopleRef.current.delete(personId)
              }, 5000) // 5秒後に削除
            }
          }

          // 境界ボックスを描画
          ctx.strokeStyle = "#00FFFF"
          ctx.lineWidth = 2
          ctx.strokeRect(bbox[0], bbox[1], bbox[2], bbox[3])

          // ラベルを描画
          ctx.fillStyle = "#00FFFF"
          ctx.font = "18px Arial"
          ctx.fillText(`${objectClass}: ${Math.round(score * 100)}%`, bbox[0], bbox[1] > 10 ? bbox[1] - 5 : 10)
        }
      })

      setDetectedObjects(objectCounts)

      // 次のフレームを処理
      if (isRunning) {
        requestAnimationFrame(detectFrame)
      }
    } catch (err) {
      console.error("検出処理中にエラーが発生しました:", err)
      setError("検出処理中にエラーが発生しました。")
    }
  }

  return (
    <div className="flex flex-col items-center w-full">
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>エラー</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs
        defaultValue="local"
        className="w-full mb-6"
        onValueChange={(value) => setCameraMode(value as "local" | "remote")}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="local">ローカルカメラ</TabsTrigger>
          <TabsTrigger value="remote">iPhoneカメラ</TabsTrigger>
        </TabsList>

        <TabsContent value="local" className="space-y-4">
          <p>コンピュータに接続されているカメラを使用します。</p>
          <div className="flex gap-2">
            {!isRunning ? (
              <Button onClick={startLocalCamera} className="gap-2">
                <Video className="h-4 w-4" />
                カメラを開始
              </Button>
            ) : (
              <Button onClick={stopCamera} variant="destructive" className="gap-2">
                <Video className="h-4 w-4" />
                カメラを停止
              </Button>
            )}
          </div>
        </TabsContent>

        <TabsContent value="remote" className="space-y-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="connectionId">接続ID</Label>
              <Input
                id="connectionId"
                placeholder="iPhoneと同じ接続IDを入力（例: camera1）"
                value={connectionId}
                onChange={(e) => setConnectionId(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                iPhoneまたはiPad Proで使用している接続IDと同じものを入力してください
              </p>
            </div>

            <div className="flex gap-2">
              {!isRunning ? (
                <Button onClick={startRemoteCamera} className="gap-2" disabled={!connectionId}>
                  <Smartphone className="h-4 w-4" />
                  iPhoneカメラを接続
                </Button>
              ) : (
                <Button onClick={stopCamera} variant="destructive" className="gap-2">
                  <Smartphone className="h-4 w-4" />
                  接続を停止
                </Button>
              )}
            </div>

            <Alert>
              <AlertTitle>使用方法</AlertTitle>
              <AlertDescription>
                1. iPhoneまたはiPad Proで <code>/camera</code> ページにアクセスします
                <br />
                2. 同じ接続IDを設定し、カメラを起動してストリーミングを開始します
                <br />
                3. このページで同じ接続IDを入力し「iPhoneカメラを接続」をクリックします
              </AlertDescription>
            </Alert>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex flex-col md:flex-row gap-4 w-full">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              カメラ映像
            </CardTitle>
          </CardHeader>
          <CardContent className="relative">
            <div className="relative aspect-video bg-black rounded-md overflow-hidden">
              <video ref={videoRef} className="absolute inset-0 w-full h-full object-contain" playsInline />
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-contain" />
              {!isRunning && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
                  <p>カメラが停止しています</p>
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-2 justify-center">
              {isRunning && (
                <Button onClick={stopCamera} variant="destructive" className="gap-2">
                  <Video className="h-4 w-4" />
                  カメラを停止
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="flex-1">
          <CardHeader>
            <CardTitle>検出結果</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-md">
                <h3 className="text-xl font-bold mb-2">通過した人数</h3>
                <p className="text-4xl font-bold">{peopleCount}人</p>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-2">現在検出されているオブジェクト</h3>
                {Object.keys(detectedObjects).length > 0 ? (
                  <ul className="space-y-2">
                    {Object.entries(detectedObjects).map(([objectClass, count]) => (
                      <li key={objectClass} className="flex justify-between">
                        <span>{objectClass === "person" ? "人" : objectClass === "car" ? "車" : objectClass}</span>
                        <span className="font-medium">{count}個</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">検出されたオブジェクトはありません</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
