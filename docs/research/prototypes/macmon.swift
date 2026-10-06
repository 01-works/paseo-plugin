// Prototype long-running helper: one JSON line per interval on stdout.
// usage: macmon [intervalMs=2000] [count=0(inf)]
import Darwin
import Dispatch

let args = CommandLine.arguments
let intervalMs = args.count > 1 ? Int(args[1]) ?? 2000 : 2000
let maxCount = args.count > 2 ? Int(args[2]) ?? 0 : 0
setvbuf(stdout, nil, _IOLBF, 0)

let host = mach_host_self()
var pageSize: vm_size_t = 0
host_page_size(host, &pageSize)
let page = UInt64(pageSize)
var tb = mach_timebase_info_data_t(); mach_timebase_info(&tb)
let absToNs = Double(tb.numer) / Double(tb.denom)

func sysctlInt<T>(_ name: String, _ v: inout T) -> Bool {
  var len = MemoryLayout<T>.size
  return sysctlbyname(name, &v, &len, nil, 0) == 0
}
var memTotal: UInt64 = 0; _ = sysctlInt("hw.memsize", &memTotal)

// Memory pressure events (push) – logged into the stream as last event.
var lastPressureEvent = "none"
let mp = DispatchSource.makeMemoryPressureSource(eventMask: [.normal, .warning, .critical], queue: .main)
mp.setEventHandler {
  let e = mp.data
  lastPressureEvent = e.contains(.critical) ? "critical" : e.contains(.warning) ? "warning" : "normal"
}
mp.resume()

var prevTicks: [UInt32] = [0, 0, 0, 0]
struct ProcPrev { var cpu: UInt64; var start: UInt64 }
var prevProc: [pid_t: ProcPrev] = [:]
var groupCache: [pid_t: (UInt64, String)] = [:]   // pid -> (start abstime, group)
var prevTime = clock_gettime_nsec_np(CLOCK_UPTIME_RAW)
var pids = [pid_t](repeating: 0, count: 8192)

func groupName(_ pid: pid_t) -> String {
  var buf = [CChar](repeating: 0, count: 4 * Int(MAXPATHLEN) /* PROC_PIDPATHINFO_MAXSIZE */)
  guard proc_pidpath(pid, &buf, UInt32(buf.count)) > 0 else { return "?" }
  return buf.withUnsafeMutableBufferPointer { b -> String in
    let base = b.baseAddress!
    if let app = strstr(base, ".app/") {          // outermost .app bundle
      app.pointee = 0
      let slash = strrchr(base, Int32(UInt8(ascii: "/")))
      return String(cString: slash.map { $0 + 1 } ?? base) + ".app"
    }
    if strstr(base, "/claude/versions/") != nil { return "claude" }
    let slash = strrchr(base, Int32(UInt8(ascii: "/")))
    return String(cString: slash.map { $0 + 1 } ?? base)
  }
}

func esc(_ s: String) -> String { var o = ""; for ch in s { if ch == "\"" || ch == "\\" { o.append("\\") }; o.append(ch) }; return o }
func f1(_ x: Double) -> Double { (x * 10).rounded() / 10 }

var n = 0
func tick() {
  let t0 = clock_gettime_nsec_np(CLOCK_UPTIME_RAW)
  // memory
  var vm = vm_statistics64_data_t()
  var c = mach_msg_type_number_t(MemoryLayout<vm_statistics64_data_t>.size / MemoryLayout<integer_t>.size)
  _ = withUnsafeMutablePointer(to: &vm) { $0.withMemoryRebound(to: integer_t.self, capacity: Int(c)) { host_statistics64(host, HOST_VM_INFO64, $0, &c) } }
  let app = (UInt64(vm.internal_page_count) - UInt64(vm.purgeable_count)) * page
  let wired = UInt64(vm.wire_count) * page
  let compressed = UInt64(vm.compressor_page_count) * page
  let cached = (UInt64(vm.external_page_count) + UInt64(vm.purgeable_count)) * page
  var sw = xsw_usage(); _ = sysctlInt("vm.swapusage", &sw)
  var pressure: Int32 = 0; _ = sysctlInt("kern.memorystatus_vm_pressure_level", &pressure)
  // cpu
  var cpu = host_cpu_load_info_data_t()
  var cc = mach_msg_type_number_t(MemoryLayout<host_cpu_load_info_data_t>.size / MemoryLayout<integer_t>.size)
  _ = withUnsafeMutablePointer(to: &cpu) { $0.withMemoryRebound(to: integer_t.self, capacity: Int(cc)) { host_statistics(host, HOST_CPU_LOAD_INFO, $0, &cc) } }
  let ticks = [cpu.cpu_ticks.0, cpu.cpu_ticks.1, cpu.cpu_ticks.2, cpu.cpu_ticks.3] // user, system, idle, nice
  let d = (0..<4).map { Double(ticks[$0] &- prevTicks[$0]) }
  let tot = max(d.reduce(0, +), 1)
  prevTicks = ticks
  // processes
  let now = clock_gettime_nsec_np(CLOCK_UPTIME_RAW)
  let dtNs = Double(now - prevTime); prevTime = now
  let cnt = Int(proc_listallpids(&pids, Int32(pids.count * MemoryLayout<pid_t>.size)))
  var groups: [String: (foot: UInt64, cpu: Double, n: Int)] = [:]
  var nextPrev: [pid_t: ProcPrev] = [:]; nextPrev.reserveCapacity(cnt)
  var denied = 0
  for i in 0..<cnt {
    let pid = pids[i]
    var ri = rusage_info_v4()
    let r = withUnsafeMutablePointer(to: &ri) { $0.withMemoryRebound(to: rusage_info_t?.self, capacity: 1) { proc_pid_rusage(pid, RUSAGE_INFO_V4, $0) } }
    if r != 0 { denied += 1; continue }
    let cpuAbs = ri.ri_user_time + ri.ri_system_time
    var pct = 0.0
    if let p = prevProc[pid], p.start == ri.ri_proc_start_abstime, cpuAbs >= p.cpu { pct = Double(cpuAbs - p.cpu) * absToNs / dtNs * 100 }
    nextPrev[pid] = ProcPrev(cpu: cpuAbs, start: ri.ri_proc_start_abstime)
    let g: String
    if let cached = groupCache[pid], cached.0 == ri.ri_proc_start_abstime { g = cached.1 } else { g = groupName(pid); groupCache[pid] = (ri.ri_proc_start_abstime, g) }
    groups[g, default: (0, 0, 0)].foot += ri.ri_phys_footprint
    groups[g, default: (0, 0, 0)].cpu += pct
    groups[g, default: (0, 0, 0)].n += 1
  }
  groupCache = groupCache.filter { nextPrev[$0.key] != nil }
  let first = prevProc.isEmpty
  prevProc = nextPrev
  let top = groups.sorted { first ? $0.value.foot > $1.value.foot : ($0.value.cpu + Double($0.value.foot) / 1e10) > ($1.value.cpu + Double($1.value.foot) / 1e10) }.prefix(8)
  let topJson = top.map { "{\"name\":\"\(esc($0.key))\",\"footprint\":\($0.value.foot),\"cpu\":\(f1($0.value.cpu)),\"count\":\($0.value.n)}" }.joined(separator: ",")
  var ru = rusage(); getrusage(RUSAGE_SELF, &ru)
  let selfCpu = Double(ru.ru_utime.tv_sec + ru.ru_stime.tv_sec) + Double(ru.ru_utime.tv_usec + ru.ru_stime.tv_usec) / 1e6
  let costUs = Double(clock_gettime_nsec_np(CLOCK_UPTIME_RAW) - t0) / 1000
  print("{\"t\":\(time(nil)),\"mem\":{\"total\":\(memTotal),\"used\":\(app + wired + compressed),\"app\":\(app),\"wired\":\(wired),\"compressed\":\(compressed),\"cached\":\(cached),\"swapUsed\":\(sw.xsu_used),\"swapTotal\":\(sw.xsu_total),\"pressure\":\(pressure),\"pressureEvent\":\"\(lastPressureEvent)\"},\"cpu\":{\"user\":\(f1(100 * (d[0] + d[3]) / tot)),\"system\":\(f1(100 * d[1] / tot)),\"idle\":\(f1(100 * d[2] / tot))},\"procs\":{\"count\":\(cnt),\"denied\":\(denied),\"top\":[\(topJson)]},\"self\":{\"cpuSec\":\((selfCpu * 1000).rounded() / 1000),\"sampleUs\":\(Int(costUs)),\"maxrss\":\(ru.ru_maxrss)}}")
  n += 1
  if maxCount > 0 && n >= maxCount { exit(0) }
}

let timer = DispatchSource.makeTimerSource(queue: .main)
timer.schedule(deadline: .now(), repeating: .milliseconds(intervalMs), leeway: .milliseconds(intervalMs / 10))
timer.setEventHandler(handler: tick)
timer.resume()
signal(SIGPIPE, SIG_DFL) // exit when Node parent goes away
dispatchMain()
