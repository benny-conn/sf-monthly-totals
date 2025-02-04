"use server"

import csv from "csv-parser"
import { createObjectCsvWriter } from "csv-writer"
import { put } from "@vercel/blob"
import { join } from "path"
import { tmpdir } from "os"
import { unlink } from "fs/promises"
import { readFile } from "fs/promises"

// Add at the top of the file after imports
const projectMappings = {
  "Devin Daniels": "Devin Daniels x3",
  "Quintet Live": "Devin Daniels x3",
  "LesGo!": "Devin Daniels x3",
}

const subProjectMappings = {
  "Devin Daniels x3": {
    "LP [180-g, numbered, edition of 500]":
      "LP [180-g, numbered, edition of 1,000]",
  },
  "Live at Sam First": {
    "Limited Edition 180-gram vinyl LP": "Limited Edition 180-gram vinyl LP",
    "LP [180-g]": "Limited Edition 180-gram vinyl LP",
  },
  "Clam City": {
    "2x Limited Edition 180-gram vinyl LP":
      "Double LP [two 180-g discs, numbered, edition of 500]",
    "Limited Edition 180-gram vinyl LP":
      "Double LP [two 180-g discs, numbered, edition of 500]",
    "High-res digital download FLAC or WAV":
      "Digital Album Download [multiple formats]",
  },
  "World Travelers": {
    "LP [180-g]": "Limited Edition 180-gram vinyl LP",
    "180-Gram LP": "Limited Edition 180-gram vinyl LP",
    "High-res digital download FLAC or WAV":
      "Digital Album Download [multiple formats]",
  },
  Humanoid: {
    "LP [180-g, numbered, edition of 500]": "Limited Edition 180-gram vinyl LP",
    "High-res digital download FLAC or WAV":
      "Digital Album Download [multiple formats]",
  },
}

// Helper function to clean text
function cleanText(text) {
  return text
    .replace(/[\\\/\*\?\"\<\>\|]/g, "") // Remove problematic characters
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim()
}

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
  const salesFile = formData.get("salesFile")
  const stripeFile = formData.get("stripeFile")

  // Parse both files
  const salesResults = await parseCSVBuffer(await salesFile.arrayBuffer())
  const stripeResults = await parseCSVBuffer(await stripeFile.arrayBuffer())

  // Process stripe data first to create a fee mapping
  const orderFees = new Map()

  stripeResults.forEach(row => {
    const columns = Object.values(row)
    const type = columns[7]

    // Try to get order ID directly first, then fall back to description
    let orderId = columns[9]
    if (!orderId) {
      const description = columns[8]
      if (description) {
        const orderMatch = description.match(/Order\s#?(\d+)/)
        if (orderMatch) {
          orderId = orderMatch[1]
        }
      }
    }

    if (!orderId) return

    const gross = parseFloat(columns[4].replace(/[$,]/g, "")) || 0
    const fee = parseFloat(columns[5].replace(/[$,]/g, "")) || 0
    const net = parseFloat(columns[6].replace(/[$,]/g, "")) || 0

    // Only process charges, not refunds
    if (type.toLowerCase() === "charge") {
      console.log("charge", orderId, fee, gross, net)
      orderFees.set(orderId, {
        fee,
        totalAmount: gross,
        netAmount: net,
      })
    }
  })

  // Create enhanced WordPress report first
  const enhancedWordpressData = []
  const salesByOrder = new Map()

  // Group sales by order ID first
  salesResults.forEach(row => {
    const columns = Object.values(row)
    const orderId = columns[0]
    // Skip rows with no order ID
    if (!orderId) return

    if (!salesByOrder.has(orderId)) {
      salesByOrder.set(orderId, [])
    }
    salesByOrder.get(orderId).push(columns)
  })

  // Process each order and its items
  salesByOrder.forEach((orderItems, orderId) => {
    const orderFeeInfo = orderFees.get(orderId)

    // Debug log
    console.log(`Processing order ${orderId}:`)

    // Get number of items in this order
    const itemCount = orderItems.length
    console.log(`Items in order: ${itemCount}`)

    // Each item gets an equal share
    const itemRatio = 1 / itemCount

    // Get order-level values from first item
    const firstItemColumns = orderItems[0]
    const orderShipping =
      parseFloat(firstItemColumns[4].replace(/[$,]/g, "")) || 0
    const orderTax = parseFloat(firstItemColumns[8].replace(/[$,]/g, "")) || 0

    // Debug log
    console.log(`Order shipping: ${orderShipping}, Order tax: ${orderTax}`)
    console.log(`Each item ratio: ${itemRatio}`)

    orderItems.forEach(columns => {
      // Calculate allocated amounts - each item gets equal share
      const allocatedStripeFee = orderFeeInfo ? orderFeeInfo.fee * itemRatio : 0
      const allocatedStripeGross = orderFeeInfo
        ? orderFeeInfo.totalAmount * itemRatio
        : 0
      const allocatedStripeNet = orderFeeInfo
        ? orderFeeInfo.netAmount * itemRatio
        : 0
      const allocatedShipping = orderShipping * itemRatio
      const allocatedTax = orderTax * itemRatio

      // Debug log
      console.log("Allocated amounts:", {
        fee: allocatedStripeFee,
        gross: allocatedStripeGross,
        net: allocatedStripeNet,
        shipping: allocatedShipping,
        tax: allocatedTax,
      })

      // Create enhanced row with additional columns
      enhancedWordpressData.push({
        ...Object.fromEntries(
          columns.map((val, i) => [Object.keys(salesResults[0])[i], val])
        ),
        AllocatedStripeFee: (-Math.abs(allocatedStripeFee)).toFixed(2),
        AllocatedStripeGross: allocatedStripeGross.toFixed(2),
        AllocatedStripeNet: allocatedStripeNet.toFixed(2),
        AllocatedShipping: allocatedShipping.toFixed(2),
        AllocatedTax: allocatedTax.toFixed(2),
        ItemRatio: itemRatio.toFixed(4),
      })
    })
  })

  // Create enhanced WordPress CSV
  const wordpressHeaders = [
    ...Object.keys(salesResults[0]),
    "AllocatedStripeFee",
    "AllocatedStripeGross",
    "AllocatedStripeNet",
    "AllocatedShipping",
    "AllocatedTax",
    "ItemRatio",
  ]

  const enhancedWordpressCSV = {
    header: wordpressHeaders.map(h => ({ id: h, title: h })),
    records: enhancedWordpressData,
  }

  // Process sales data with fee allocation
  const processedData = {}
  const fields = [
    "subtotal",
    "subtotalTax",
    "total",
    "totalTax",
    "shipping",
    "feeTotal",
    "feeTaxTotal",
    "stripeFee",
    "discount",
    "refunded",
  ]

  salesResults.forEach((row, index) => {
    const columns = Object.values(row)
    const orderId = columns[0]
    const orderFeeInfo = orderFees.get(orderId)

    // Skip non-completed orders
    if (columns[3] !== "completed") return

    const date = new Date(columns[2])
    const month = `${date.getMonth() + 1}/${date.getFullYear()}`

    // Extract project and subproject
    let project, subProject
    const projectColumn = columns[40].trim()

    if (projectColumn.includes(" - ")) {
      ;[project, subProject] = projectColumn.split(" - ").map(s => cleanText(s))
    } else {
      project = cleanText(projectColumn)
      const formatColumn = columns[50].trim()
      subProject = formatColumn.startsWith("Format=")
        ? cleanText(formatColumn.substring(7))
        : cleanText(formatColumn)
    }

    // console.log("before", project, subProject)

    let beforeProject = project
    let beforeSubProject = subProject

    // Apply mappings
    project = projectMappings[project] ?? project
    subProject = subProjectMappings[project]?.[subProject] ?? subProject

    // console.log("after", project, subProject)

    // if (
    //   projectMappings[beforeProject] ||
    //   subProjectMappings[beforeProject]?.[beforeSubProject]
    // ) {
    //   console.log(
    //     "THERE WAS A MAPPING",
    //     beforeProject,
    //     "->",
    //     projectMappings[beforeProject],
    //     beforeSubProject,
    //     "->",
    //     subProjectMappings[beforeProject]?.[beforeSubProject]
    //   )
    // }

    // Skip empty projects or sub-projects
    if (!project || !subProject) {
      return
    }

    // if (index < 5 || index > salesResults.length - 5) {
    //   console.log(
    //     `Row ${index + 1}: Date: ${
    //       columns[2]
    //     }, Project: ${project}, SubProject: ${subProject}`
    //   )
    // }

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
      feeTotal: 6,
      feeTaxTotal: 7,
      stripeFee: 8,
      discount: 9,
      refunded: 11,
    }

    // Process each field
    Object.entries(fieldMapping).forEach(([field, columnIndex]) => {
      const value =
        parseFloat(
          columns[columnIndex].replace("$", "").replace(",", "").trim()
        ) || 0

      // Make fee-related fields and stripe fee negative
      const adjustedValue =
        field === "feeTotal" || field === "feeTaxTotal" || field === "stripeFee"
          ? -Math.abs(value)
          : value

      // Add shipping tax to total tax
      if (field === "totalTax") {
        const shippingTax =
          parseFloat(columns[5].replace("$", "").replace(",", "").trim()) || 0
        processedData[project][subProject][month][field] +=
          adjustedValue + shippingTax
      } else {
        processedData[project][subProject][month][field] += adjustedValue
      }
    })

    // Calculate and add stripe fee separately (as negative)
    let allocatedFee = 0
    if (orderFeeInfo) {
      const itemAmount =
        parseFloat(columns[44].replace("$", "").replace(",", "")) || 0
      const feeRatio = itemAmount / orderFeeInfo.totalAmount
      allocatedFee = -Math.abs(orderFeeInfo.fee * feeRatio) // Make negative
    }

    // Add the allocated fee to stripeFee
    processedData[project][subProject][month].stripeFee += allocatedFee
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

  //   console.log("Sorted Months:", months)

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

  //   console.log("First 5 rows of output data:")
  //   console.log(JSON.stringify(outputData.slice(0, 5), null, 2))

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

  // Create temporary files
  const totalsFilePath = await createTempFile(csvData)
  const wordpressFilePath = await createTempFile(enhancedWordpressCSV)

  // Upload both files to Vercel Blob
  const totalsBlob = await put(
    `monthly-sales-totals-${Date.now()}.csv`,
    await readFile(totalsFilePath),
    {
      access: "public",
      addRandomSuffix: true,
    }
  )

  const wordpressBlob = await put(
    `enhanced-wordpress-${Date.now()}.csv`,
    await readFile(wordpressFilePath),
    {
      access: "public",
      addRandomSuffix: true,
    }
  )

  // Clean up temp files
  await unlink(totalsFilePath)
  await unlink(wordpressFilePath)

  // Return both URLs
  return {
    totalsUrl: totalsBlob.url,
    wordpressUrl: wordpressBlob.url,
  }
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
    `streaming-monthly-totals-${Date.now()}.csv`,
    await readFile(tempFilePath),
    {
      access: "public",
      addRandomSuffix: true,
    }
  )

  // Clean up temp file
  await unlink(tempFilePath)

  console.log(`File uploaded to ${blob.url}`)

  // Return the Blob URL
  return { downloadUrl: blob.url }
}

// Helper function to parse CSV buffer
async function parseCSVBuffer(buffer) {
  const results = []
  const parser = csv()
  parser.on("data", data => results.push(data))
  parser.write(Buffer.from(buffer))
  parser.end()

  return new Promise(resolve => parser.on("end", () => resolve(results)))
}
