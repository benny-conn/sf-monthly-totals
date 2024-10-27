"use server"

import csv from "csv-parser"
import { createObjectCsvWriter } from "csv-writer"
import { put } from "@vercel/blob"
import { writeFile } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { unlink } from "fs/promises"
import { readFile } from "fs/promises"

// Helper function to create temporary file
async function createTempFile(data) {
  const tempPath = join(tmpdir(), `temp-${Date.now()}.csv`)
  const csvWriter = createObjectCsvWriter({
    path: tempPath,
    header: data.header,
  })
  await csvWriter.writeRecords(data.records)
  return tempPath
}

export async function processSalesCSV(formData) {
  const file = formData.get("file")
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // Parse the CSV
  const results = []
  const parser = csv()
  parser.on("data", data => results.push(data))
  parser.write(buffer)
  parser.end()

  // Wait for parsing to complete
  await new Promise(resolve => parser.on("end", resolve))

  console.log(`Total rows parsed: ${results.length}`)

  // Process the data
  const processedData = {}
  const fields = [
    "subtotal",
    "discount",
    "adjustedSubtotal",
    "tax",
    "shipping",
    "total",
    "gross",
    "fee",
    "net",
  ]
  const fieldIndices = [62, 64, 65, 66, 67, 68, 69, 70, 71] // Updated indices
  results.forEach((row, index) => {
    const columns = Object.values(row)
    const date = new Date(columns[58])
    const month = `${date.getMonth() + 1}/${date.getFullYear()}`
    const project = columns[60].trim()
    const subProject = columns[61].trim()

    // Skip empty projects or sub-projects
    if (!project || !subProject) {
      return
    }

    if (index < 5 || index > results.length - 5) {
      console.log(
        `Row ${index + 1}: Date: ${
          columns[58]
        }, Project: ${project}, SubProject: ${subProject}`
      )
    }

    if (!processedData[project]) {
      processedData[project] = {}
    }
    if (!processedData[project][subProject]) {
      processedData[project][subProject] = {}
    }
    if (!processedData[project][subProject][month]) {
      processedData[project][subProject][month] = fields.reduce(
        (acc, field) => ({ ...acc, [field]: 0 }),
        {}
      )
    }

    // Process each field
    fields.forEach((field, idx) => {
      const value =
        parseFloat(
          columns[fieldIndices[idx]].replace("$", "").replace(",", "").trim()
        ) || 0
      processedData[project][subProject][month][field] += value
    })
  })

  // Prepare data for CSV writing
  const months = [
    ...new Set(
      Object.values(processedData).flatMap(Object.values).flatMap(Object.keys)
    ),
  ].sort((a, b) => {
    const [aMonth, aYear] = a.split("/")
    const [bMonth, bYear] = b.split("/")
    return new Date(aYear, aMonth - 1) - new Date(bYear, bMonth - 1)
  })

  console.log("Sorted Months:", months)

  const outputData = Object.entries(processedData).flatMap(
    ([project, subProjects]) => {
      const projectRows = []
      projectRows.push({
        Project: project,
        SubProject: "",
        Label: "", // Added new column
        ...Object.fromEntries(months.map(m => [m, ""])),
      })

      Object.entries(subProjects).forEach(([subProject, monthData]) => {
        projectRows.push({
          Project: "",
          SubProject: subProject,
          Label: "", // Added new column
          ...Object.fromEntries(months.map(m => [m, ""])),
        })

        fields.forEach(field => {
          projectRows.push({
            Project: "",
            SubProject: "",
            Label: field.charAt(0).toUpperCase() + field.slice(1), // Put field names in new column
            ...Object.fromEntries(
              months.map(m => [m, monthData[m]?.[field] || 0])
            ),
          })
        })
      })

      return projectRows
    }
  )

  console.log("First 5 rows of output data:")
  console.log(JSON.stringify(outputData.slice(0, 5), null, 2))

  // Prepare the CSV data
  const csvData = {
    header: [
      { id: "Project", title: "Project" },
      { id: "SubProject", title: "Sub Project" },
      { id: "Label", title: "Label" },
      ...months.map(month => ({ id: month, title: month })),
    ],
    records: outputData,
  }

  // Create temporary file
  const tempFilePath = await createTempFile(csvData)

  // Upload to Vercel Blob
  const blob = await put(
    `monthly-totals-${Date.now()}.csv`,
    await readFile(tempFilePath),
    { access: "public" }
  )

  // Clean up temp file
  await unlink(tempFilePath)

  console.log(`File uploaded to ${blob.url}`)

  // Return the Blob URL
  return { downloadUrl: blob.url }
}

export async function processStreamingCSV(formData) {
  const file = formData.get("file")
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // Parse the TSV
  const results = []
  const parser = csv({ separator: "\t" }) // Set separator to tab for TSV
  parser.on("data", data => results.push(data))
  parser.write(buffer)
  parser.end()

  // Wait for parsing to complete
  await new Promise(resolve => parser.on("end", resolve))

  console.log(`Total rows parsed: ${results.length}`)

  // Process the data
  const processedData = {}
  const fields = ["quantity", "royalties", "earnings"]
  const fieldIndices = [7, 11, 12]

  results.forEach((row, index) => {
    const columns = Object.values(row)
    const month = columns[1] // Already in YYYY-MM format
    const project = columns[3].trim()

    // Skip empty projects
    if (!project) {
      return
    }

    if (index < 5 || index > results.length - 5) {
      console.log(`Row ${index + 1}: Month: ${month}, Project: ${project}`)
    }

    if (!processedData[project]) {
      processedData[project] = {}
    }
    if (!processedData[project][month]) {
      processedData[project][month] = fields.reduce(
        (acc, field) => ({ ...acc, [field]: 0 }),
        {}
      )
    }

    // Process each field
    fields.forEach((field, idx) => {
      const value =
        parseFloat(columns[fieldIndices[idx]].replace(",", "").trim()) || 0
      processedData[project][month][field] += value
    })
  })

  // Prepare data for CSV writing
  const months = [
    ...new Set(Object.values(processedData).flatMap(Object.keys)),
  ].sort((a, b) => a.localeCompare(b)) // Simple string comparison works for YYYY-MM format

  console.log("Sorted Months:", months)

  const outputData = Object.entries(processedData).flatMap(
    ([project, monthData]) => {
      const projectRows = []
      projectRows.push({
        Project: project,
        Label: "",
        ...Object.fromEntries(months.map(m => [m, ""])),
      })

      fields.forEach(field => {
        projectRows.push({
          Project: "",
          Label: field.charAt(0).toUpperCase() + field.slice(1),
          ...Object.fromEntries(
            months.map(m => [m, monthData[m]?.[field] || 0])
          ),
        })
      })

      return projectRows
    }
  )

  console.log("First 5 rows of output data:")
  console.log(JSON.stringify(outputData.slice(0, 5), null, 2))

  // Prepare the CSV data
  const csvData = {
    header: [
      { id: "Project", title: "Project" },
      { id: "Label", title: "Label" },
      ...months.map(month => ({ id: month, title: month })),
    ],
    records: outputData,
  }

  // Create temporary file
  const tempFilePath = await createTempFile(csvData)

  // Upload to Vercel Blob
  const blob = await put(
    `streaming-monthly-totals-${Date.now()}.csv`,
    await readFile(tempFilePath),
    { access: "public" }
  )

  // Clean up temp file
  await unlink(tempFilePath)

  console.log(`File uploaded to ${blob.url}`)

  // Return the Blob URL
  return { downloadUrl: blob.url }
}
