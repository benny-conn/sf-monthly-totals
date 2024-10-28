"use server"

import csv from "csv-parser"
import { createObjectCsvWriter } from "csv-writer"
import { put } from "@vercel/blob"
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
    "subtotalTax",
    "total",
    "totalTax",
    "shipping",
    "shippingTax",
    "feeTotal",
    "feeTaxTotal",
    "discount",
    "refunded",
  ]

  results.forEach((row, index) => {
    const columns = Object.values(row)

    // Skip non-completed orders
    if (columns[3] !== "completed") {
      return
    }

    const date = new Date(columns[2])
    const month = `${date.getMonth() + 1}/${date.getFullYear()}`

    // Extract project and subproject
    let project, subProject
    const projectColumn = columns[40].trim()

    if (projectColumn.includes(" - ")) {
      ;[project, subProject] = projectColumn.split(" - ").map(s => s.trim())
    } else {
      project = projectColumn
      const formatColumn = columns[50].trim()
      subProject = formatColumn.startsWith("Format=")
        ? formatColumn.substring(7).trim()
        : formatColumn
    }

    // Skip empty projects or sub-projects
    if (!project || !subProject) {
      return
    }

    if (index < 5 || index > results.length - 5) {
      console.log(
        `Row ${index + 1}: Date: ${
          columns[2]
        }, Project: ${project}, SubProject: ${subProject}`
      )
    }

    // Initialize data structure
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

    // Map fields to their column indices
    const fieldMapping = {
      subtotal: 44,
      subtotalTax: 45,
      total: 46,
      totalTax: 47,
      shipping: 4,
      shippingTax: 5,
      feeTotal: 6,
      feeTaxTotal: 7,
      discount: 9,
      refunded: 11,
    }

    // Process each field
    Object.entries(fieldMapping).forEach(([field, columnIndex]) => {
      const value =
        parseFloat(
          columns[columnIndex].replace("$", "").replace(",", "").trim()
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
        Label: "",
        ...Object.fromEntries(months.map(m => [m, ""])),
      })

      Object.entries(subProjects).forEach(([subProject, monthData]) => {
        projectRows.push({
          Project: "",
          SubProject: subProject,
          Label: "",
          ...Object.fromEntries(months.map(m => [m, ""])),
        })

        fields.forEach(field => {
          projectRows.push({
            Project: "",
            SubProject: "",
            Label: field.charAt(0).toUpperCase() + field.slice(1),
            ...Object.fromEntries(
              months.map(m => [
                m,
                Number(monthData[m]?.[field] || 0).toFixed(2),
              ])
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
    "monthly-sales-totals.csv",
    await readFile(tempFilePath),
    {
      access: "public",
      addRandomSuffix: false,
    }
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
            months.map(m => [m, Number(monthData[m]?.[field] || 0).toFixed(2)])
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
    "streaming-monthly-totals.csv",
    await readFile(tempFilePath),
    {
      access: "public",
      addRandomSuffix: false,
    }
  )

  // Clean up temp file
  await unlink(tempFilePath)

  console.log(`File uploaded to ${blob.url}`)

  // Return the Blob URL
  return { downloadUrl: blob.url }
}
