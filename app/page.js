"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { processCSV } from "./actions.js"

export default function Home() {
  const [file, setFile] = useState(null)
  const [processedFileUrl, setProcessedFileUrl] = useState(null)

  const handleFileChange = e => {
    setFile(e.target.files[0])
    setProcessedFileUrl(null)
  }

  const handleUpload = async () => {
    if (!file) return

    const formData = new FormData()
    formData.append("file", file)

    try {
      const result = await processCSV(formData)
      setProcessedFileUrl(result.downloadUrl)
    } catch (error) {
      console.error("Error processing CSV:", error)
      // Handle error (e.g., show error message to user)
    }
  }

  return (
    <div className="flex flex-col gap-8 px-16 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Monthly Totals</h1>
        <p>
          Upload the Sam First CSV breakdown and download the final totals
          itemized by project.
        </p>
      </div>
      <div className="flex flex-col gap-2 items-start">
        <div className="grid w-full max-w-sm items-center gap-1.5">
          <Label htmlFor="csvFile">CSV File</Label>
          <Input
            id="csvFile"
            type="file"
            onChange={handleFileChange}
            accept=".csv"
          />
        </div>

        <Button size="lg" onClick={handleUpload}>
          Upload
        </Button>

        {processedFileUrl && (
          <a href={processedFileUrl} download>
            <Button size="lg">Download Processed CSV</Button>
          </a>
        )}
      </div>
    </div>
  )
}
