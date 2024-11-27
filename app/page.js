"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { processSalesCSV, processStreamingCSV } from "./actions.js"
import { toast } from "sonner"

export default function Home() {
  const [salesFile, setSalesFile] = useState(null)
  const [stripeFile, setStripeFile] = useState(null)
  const [streamingFile, setStreamingFile] = useState(null)
  const [processedFileURL, setProcessedFileURL] = useState(null)

  const handleSalesFileChange = e => {
    setSalesFile(e.target.files[0])
    setProcessedFileURL(null)
  }

  const handleStripeFileChange = e => {
    setStripeFile(e.target.files[0])
    setProcessedFileURL(null)
  }

  const handleStreamingFileChange = e => {
    setStreamingFile(e.target.files[0])
    setProcessedFileURL(null)
  }

  const handleSalesUpload = async () => {
    if (!salesFile || !stripeFile) {
      toast.error("Please upload both Sales and Stripe files")
      return
    }

    const formData = new FormData()
    formData.append("salesFile", salesFile)
    formData.append("stripeFile", stripeFile)

    try {
      const result = await processSalesCSV(formData)
      setProcessedFileURL(result.downloadUrl)
    } catch (error) {
      console.error("Error processing CSV:", error)
      toast.error("Error processing CSV, contact benny!")
    }
  }

  const handleStreamingUpload = async () => {
    if (!streamingFile) return

    const formData = new FormData()
    formData.append("file", streamingFile)

    try {
      const result = await processStreamingCSV(formData)
      setProcessedFileURL(result.downloadUrl)
    } catch (error) {
      console.error("Error processing CSV:", error)
      toast.error("Error processing CSV, contact benny!")
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

      <div className="flex flex-col gap-4 items-start">
        <h2 className="text-xl font-semibold">Sales Processing</h2>
        <div className="grid w-full max-w-sm items-center gap-1.5">
          <Label htmlFor="salesFile">Wordpress Sales CSV File</Label>
          <Input
            id="salesFile"
            type="file"
            onChange={handleSalesFileChange}
            accept=".csv"
          />
        </div>

        <div className="grid w-full max-w-sm items-center gap-1.5">
          <Label htmlFor="stripeFile">Stripe Payments CSV File</Label>
          <Input
            id="stripeFile"
            type="file"
            onChange={handleStripeFileChange}
            accept=".csv"
          />
        </div>

        <Button
          size="lg"
          onClick={handleSalesUpload}
          disabled={!salesFile || !stripeFile}>
          Upload Sales Files
        </Button>
      </div>

      <div className="flex flex-col gap-4 items-start">
        <h2 className="text-xl font-semibold">Streaming Processing</h2>
        <div className="grid w-full max-w-sm items-center gap-1.5">
          <Label htmlFor="streamingFile">Distrokid Streaming TSV File</Label>
          <Input
            id="streamingFile"
            type="file"
            onChange={handleStreamingFileChange}
            accept=".tsv"
          />
        </div>

        <Button
          size="lg"
          onClick={handleStreamingUpload}
          disabled={!streamingFile}>
          Upload Streaming File
        </Button>
      </div>

      {processedFileURL && (
        <Button size="lg" asChild className="max-w-96">
          <a href={processedFileURL} target="_blank" rel="noopener noreferrer">
            Download Processed CSV
          </a>
        </Button>
      )}
    </div>
  )
}
