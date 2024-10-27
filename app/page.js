"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { processSalesCSV, processStreamingCSV } from "./actions.js"
import { toast } from "sonner"

export default function Home() {
  const [file, setFile] = useState(null)

  const [processedFileURL, setProcessedFileURL] = useState(null)

  const handleFileChange = e => {
    setFile(e.target.files[0])
    setProcessedFileURL(null)
  }

  const handleSalesUpload = async () => {
    if (!file) return

    const formData = new FormData()
    formData.append("file", file)

    try {
      const result = await processSalesCSV(formData)
      setProcessedFileURL(result.downloadUrl)
    } catch (error) {
      console.error("Error processing CSV:", error)
      toast.error("Error processing CSV, contact benny!")
    }
  }

  const handleStreamingUpload = async () => {
    if (!file) return

    const formData = new FormData()
    formData.append("file", file)

    try {
      const result = await processStreamingCSV(formData)
      setProcessedFileURL(result.downloadUrl)
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
          <Label htmlFor="csvFile">Wordpress Sales CSV File</Label>
          <Input
            id="csvFile"
            type="file"
            onChange={handleFileChange}
            accept=".csv"
          />
        </div>

        <Button size="lg" onClick={handleSalesUpload}>
          Upload
        </Button>
      </div>
      <div className="flex flex-col gap-2 items-start">
        <div className="grid w-full max-w-sm items-center gap-1.5">
          <Label htmlFor="csvFile">Distrokid Streaming TSV File</Label>
          <Input
            id="csvFile"
            type="file"
            onChange={handleFileChange}
            accept=".tsv"
          />
        </div>

        <Button size="lg" onClick={handleStreamingUpload}>
          Upload
        </Button>
      </div>
      {processedFileURL && (
        <a href={processedFileURL} download>
          <Button size="lg">Download Processed CSV</Button>
        </a>
      )}
    </div>
  )
}
