"use server"

import { join } from "path"
import csv from "csv-parser"
import { createObjectCsvWriter } from "csv-writer"

export async function processCSV(formData) {
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
        ...Object.fromEntries(months.map(m => [m, ""])),
      })

      Object.entries(subProjects).forEach(([subProject, monthData]) => {
        projectRows.push({
          Project: "",
          SubProject: subProject,
          ...Object.fromEntries(months.map(m => [m, ""])),
        })

        fields.forEach(field => {
          projectRows.push({
            Project: "",
            SubProject: field.charAt(0).toUpperCase() + field.slice(1),
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

  // Use a fixed filename
  const filename = "monthly-totals.csv"
  const filepath = join(process.cwd(), "public", filename)

  // Write the processed data to the CSV file
  const csvWriter = createObjectCsvWriter({
    path: filepath,
    header: [
      { id: "Project", title: "Project" },
      { id: "SubProject", title: "Sub Project" },
      ...months.map(month => ({ id: month, title: month })),
    ],
  })
  await csvWriter.writeRecords(outputData)

  console.log(`CSV file written to ${filepath}`)

  // Return the URL for the processed file
  return { downloadUrl: `/${filename}` }
}
