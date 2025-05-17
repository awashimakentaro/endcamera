import CameraDetection from "@/components/camera-detection"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-6 md:p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold text-center mb-8">カメラ映像解析システム</h1>
        <CameraDetection />
      </div>
    </main>
  )
}
