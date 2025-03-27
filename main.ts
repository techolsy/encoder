/* 
  Built by Techolsy
*/

let DryRun: boolean = false
let DeleteFile: boolean = false
let DeleteLarge: boolean = false
let Notify: boolean = false
const PositionalArgs: Array<string> = []

function msg(message: string) {
  console.log(message)
}

function info(message: string) {
  console.log(`%c${message}`, "color: yellow")
}

function err(message: string) {
  console.log(`%c${message}`, "color: red")
  Deno.exit(1)
}

function notify(message: string) {
  try {
    const command = new Deno.Command("notify-send", {
      args: [
        "-a",
        "encoder",
        "-t",
        "5000",
        message,
      ],
    })
    command.outputSync()
  } catch {
    err("Failed to notify")
  }
}

function argParse() {
  for (const arg of Deno.args) {
    switch (arg) {
      case "-h":
      case "--help":
        printUsage()
        break;
      case "-u":
      case "--dry-run":
        DryRun = true
        break
      case "-n":
      case "--notify":
        Notify = true
        break
      case "-d":
      case "--delete-file":
        DeleteFile = true
        break
      case "-f":
      case "--delete-large":
        DeleteLarge = true
        break
      default:
        PositionalArgs.push(arg)
    }
  }
}

function printUsage() {
  msg("Usage:")
  msg("  encoder [--help] [--dry-run] [--notify] [--delete-file] [--delete-large] (run|poweroff)")
  msg("  encoder run")
  msg("  encoder poweroff")
  msg("")
  msg("Commands:")
  msg("  run: Start encoding")
  msg("  poweroff: poweroff system after encoding is complete")
  msg("  usage: Shows this usage message")
  msg("")
  msg("Flags:")
  msg("  -h|--help: Shows this usage message")
  msg("  -u|--dry-run: Dru run with no changes")
  msg("  -n|--notify: Send notification after encofing is complete")
  msg("  -d|--delete-file: Deletes old file after file been encoded")
  msg("  -f|--delete-large: Deletes new file if its larger than the old file")
  Deno.exit()
}

function commandExists(command: string): boolean {
  try {
    const process = new Deno.Command("which", {
      args: [command],
    })
    const { success } = process.outputSync()
    return success
  } catch {
    return false
  }
}

function checkCommands() {
  const commands: Array<string> = ["ffmpeg"]

  if (DryRun) {
    commands.push("notify-send")
  }

  for (const command of commands) {
    if (!commandExists(command)) {
      err(`Missng dependency: ${command}`)
    }
  }
}

function dirExists(directory: string): boolean {
  try {
    const dir = Deno.statSync(directory)
    return dir.isDirectory
  } catch {
    return false
  }
}

function poweroff(time: number) {
  if (time <= 0) {
    try {
      const command = new Deno.Command("systemctl", {
        args: ["poweroff"]
      })
      command.outputSync()
    } catch {
      err("Failed to poweroff system")
    }
  }

  info(`System will poweroff in ${time} seconds`)
  time--
  setTimeout(() => poweroff(time), 1000)
}

function encode(input: string) {
  const outputDirFile = Deno.lstatSync(`./output/${input}`)
  if (outputDirFile.isFile) {
    Deno.removeSync(`./output/${input}`)
  }

  info(`Encoding ${input}`)
  try {
    const process = new Deno.Command("ffmpeg", {
      args: [
        "-vaapi_device",
        "/dev/dri/renderD128",
        "-i",
        `input/${input}`,
        "-vf",
        "format=nv12,hwupload",
        "-c:v",
        "hevc_vaapi",
        `output/${input}`
      ]
    })
    const status = process.outputSync()
    if (status.success === false) {
      err(`Failed to encode ${input}`)
    }
  } catch {
    err(`Failed to encode ${input}`)
  }

  const inputInfo = Deno.lstatSync(`./input/${input}`)
  const outputInfo = Deno.lstatSync(`./output/${input}`)

  if (outputInfo.size > inputInfo.size) {
    info("new encoded file is larger")

    Deno.renameSync(`./input/${input}`, `./fails/${input}`)
    info("Moved old to fails dir")
    
    if (DeleteLarge) {
      Deno.removeSync(`./output/${input}`)
      info("Deleted new file")
    } else {
      Deno.renameSync(`./output/${input}`, `./fails/new-${input}`)
      info("Moved new file to fails dir")
    }
    return
  }

  if (DeleteFile) {
    Deno.removeSync(`./input/${input}`)
    info("Deleted old file")
  } else {
    Deno.renameSync(`./input/${input}`, `./trash/${input}`)
    info("Moved old file to trash dir")
  }
}

function main() {
  const homeDir= Deno.env.get("HOME")

  if (PositionalArgs[0] !== "usage" && PositionalArgs[0] !== "run" && PositionalArgs[0] !== "poweroff") {
    printUsage()
  }

  if (PositionalArgs[0] === "usage" ) {
    printUsage()
  }

  if (!dirExists(`${homeDir}/.encoder`)) {
    Deno.mkdirSync(`${homeDir}/.encoder`)
  }

  if (Deno.cwd() !== `${homeDir}/.encoder`) {
    Deno.chdir(`${homeDir}/.encoder`)
  }

  const folders: Array<string> = ["fails", "input", "output", "skipped", "trash"]
  for (const folder of folders) {
    if (!dirExists(folder)) {
      Deno.mkdirSync(folder)
    }
  }

  const videos: Array<string> = []
  for (const file of Deno.readDirSync("./input")) {
    if (file.name.endsWith("mp4") || file.name.endsWith("mkv") || file.name.endsWith("ts")) {
      videos.push(file.name)
    } else {
      try {
        Deno.renameSync(`./input/${file.name}`, `./skipped/${file.name}`)
        info(`Moved ${file.name} to skipped dir`)
      } catch {
        err(`Failed to move file ${file.name} to skipped dir`)
      }
    }
  }
  const totalVideos: number = videos.length

  let progress: number = 0
  for (const file of videos) {
    progress++
    info(`---------- Progress: ${progress} of ${totalVideos} ----------`)
    if (DryRun) {
      msg(`dry run ${file}`)
    } else {
      encode(file)
    }
  }

  if (Notify) {
    notify("Finished encoding")
  } else {
    info("Finished encoding")
  }

  if (PositionalArgs[0] === "poweroff") {
    poweroff(30)
  }
}

argParse()
checkCommands()
if (import.meta.main) main()
