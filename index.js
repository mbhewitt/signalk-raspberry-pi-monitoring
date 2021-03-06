/*
 *  Copyright 2018 Nikolay Mostovoy <mostovoy.nikolay@gmail.com>
 * ( This plugin is a modified version of signalk-raspberry-pi-temperature - Copyright 2018 Scott Bender <scott@scottbender.net> )
 *
 * (updated with cpu voltage by Matthew Hewitt)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const debug = require('debug')('signalk-raspberry-pi-monitoring2')
const _ = require('lodash')
const spawn = require('child_process').spawn

const bat_voltage_command = '/usr/sbin/mopicli -v|awk \'\{print \$4\}\''
const core_voltage_command = '/opt/vc/bin/vcgencmd measure_volts core'
const throttled_command = '/opt/vc/bin/vcgencmd get_throttled'
const gpu_temp_command = '/opt/vc/bin/vcgencmd measure_temp'
const cpu_temp_command = 'cat /sys/class/thermal/thermal_zone0/temp'
const cpu_util_mpstat_command = 'S_TIME_FORMAT=\'ISO\' mpstat -P ALL\|grep \\\:\|grep -v \\\%'
const mem_util_command = 'free'
const sd_util_command = 'df \/\|grep -v Used\|awk \'\{print \$5\}\'\|awk \'gsub\(\"\%\"\,\"\"\)\''
const num_cpu_command = 'grep \'model name\' /proc/cpuinfo \| wc -l'
const one_min_load_command = 'uptime\|grep \"load average\"\|awk -F: \'\{print \$5\}\'\|awk -F, \'\{print \$1\}\''

module.exports = function(app) {
  var plugin = {};
  var timer

  plugin.id = "signalk-raspberry-pi-monitoring2"
  plugin.name = "Raspberry PI Monitoring2"
  plugin.description = "Signal K Node Server Plugin for Raspberry PI monitoring"

  plugin.schema = {
    type: "object",
    description: "The user running node server must be in the video group to get GPU temperature. sysstat must be installed to activate mpstat",
    properties: {
      path_throttled: {
        title: "SignalK Path for System Status (https://www.raspberrypi.org/documentation/raspbian/applications/vcgencmd.md)",
        type: "string",
        default: "environment.rpi.throttled",
      },
      path_load_average: {
        title: "SignalK Path for one minute Load Average (scaled by cpus)",
        type: "string",
        default: "environment.rpi.load_average",
      },
      path_core_voltage: {
        title: "SignalK Path for Core Voltage (V)",
        type: "string",
        default: "environment.rpi.core.voltage",
      },
      path_bat_voltage: {
        title: "SignalK Path for MoPi Bat Voltage (V)",
        type: "string",
        default: "environment.rpi.bat.voltage",
      },
      path_cpu_temp: {
        title: "SignalK Path for CPU temperature (K)",
        type: "string",
        default: "environment.rpi.cpu.temperature",
      },
      path_gpu_temp: {
        title: "SignalK Path for GPU temperature (K)",
        type: "string",
        default: "environment.rpi.gpu.temperature",
      },
      path_cpu_util: {
        title: "SignalK Path for CPU utilisation (Please install sysstat for per core monitoring)",
        type: "string",
        default: "environment.rpi.cpu.utilisation",
      },
      path_mem_util: {
        title: "SignalK Path for memory utilisation",
        type: "string",
        default: "environment.rpi.memory.utilisation",
      },
      path_sd_util: {
        title: "SignalK Path for SD card utilisation",
        type: "string",
        default: "environment.rpi.sd.utilisation",
      },
      rate: {
        title: "Sample Rate (in seconds)",
        type: 'number',
        default: 30
      }
    }
  }


  plugin.start = function(options) {
    debug("start")

    function updateEnv() {
      getGpuTemperature()
//      getCpuTemperature()
      getCoreVoltage()
      getBatVoltage()
      getThrottled()
      getLoadAverage()
      getCpuUtil()
      getMemUtil()
      getSdUtil()
    }

    function getLoadAverage() {
      var cpus = spawn('sh', ['-c', num_cpu_command ])
      var la = spawn('sh', ['-c', one_min_load_command ])

      var cpu_num=1
      cpus.stdout.on('data', (data) => {
        cpu_num = Number(data.toString().trim())
        if(!(cpu_num>0)){
          cpu_num=1
        }
      })
      debug(`got cpuNum  ${cpu_num}`)
      la.stdout.on('data', (data_la) => {
        var la_num = data_la.toString().trim()
        debug(`got LA  ${la_num}`)
        var util=Number(la_num)/cpu_num
          
        app.handleMessage(plugin.id, {
          updates: [
            {
              values: [ {
                path: options.path_load_average,
                value: Number(util)
              }]
            }
          ]
        })
      })

      cpus.on('error', (error) => {
        console.error(error.toString())
      })

      cpus.on('data', function (data) {
        console.error(data.toString())
      })
      la.on('error', (error) => {
        console.error(error.toString())
      })

      la.on('data', function (data_la) {
        console.error(data.toString())
      })
    }
    function getThrottled() {
      var throttled = spawn('sh', ['-c', throttled_command ])

      throttled.stdout.on('data', (data) => {
        debug(`got throttled  ${data}`)
        var throttled_data = data.toString().split('=')[1].split('\n')[0].slice(-1)
        debug(`throttled is ${throttled_data}`)
        if(throttled_data!=""){
          app.handleMessage(plugin.id, {
            updates: [
              {
                values: [ {
                  path: options.path_throttled,
                  value: String(throttled_data)
                }]
              }
            ]
          })
       }
      })

      throttled.on('error', (error) => {
        console.error(error.toString())
      })

      throttled.on('data', function (data) {
        console.error(data.toString())
      })
    }
    function getCoreVoltage() {
      var corevolts = spawn('sh', ['-c', core_voltage_command ])

      corevolts.stdout.on('data', (data) => {
        debug(`got coreVolts  ${data}`)
        var core_volts = (Number(data.toString().split('=')[1].split('V')[0]) ).toFixed(4)
        debug(`core voltage is ${core_volts}`)

        app.handleMessage(plugin.id, {
          updates: [
            {
              values: [ {
                path: options.path_core_voltage,
                value: Number(core_volts)
              }]
            }
          ]
        })
      })

      corevolts.on('error', (error) => {
        console.error(error.toString())
      })

      corevolts.on('data', function (data) {
        console.error(data.toString())
      })
    }
    function getBatVoltage() {
      var batvolts = spawn('sh', ['-c', bat_voltage_command ])

      batvolts.stdout.on('data', (data) => {
//        debug(`got batVolts  ${data}`)
        var bat_volts = (Number(data.toString().trim())/1000).toFixed(5)
        debug(`bat voltage is ${bat_volts}`)

        app.handleMessage(plugin.id, {
          updates: [
            {
              values: [ {
                path: options.path_bat_voltage,
                value: Number(bat_volts)
              }]
            }
          ]
        })
      })

      batvolts.on('error', (error) => {
        console.error(error.toString())
      })

      batvolts.on('data', function (data) {
        console.error(data.toString())
      })
    }

    function getGpuTemperature() {
      var gputemp = spawn('sh', ['-c', gpu_temp_command ])

      gputemp.stdout.on('data', (data) => {
        debug(`got gpu  ${data}`)
        var gpu_temp = (Number(data.toString().split('=')[1].split('\'')[0]) + 273.15).toFixed(2)
        debug(`gpu temp is ${gpu_temp}`)

        app.handleMessage(plugin.id, {
          updates: [
            {
              values: [ {
                path: options.path_gpu_temp,
                value: Number(gpu_temp)
              }]
            }
          ]
        })
      })

      gputemp.on('error', (error) => {
        console.error(error.toString())
      })

      gputemp.on('data', function (data) {
        console.error(data.toString())
      })
    }

    function getCpuTemperature() {
      var cputemp = spawn('sh', ['-c', cpu_temp_command ])

      cputemp.stdout.on('data', (data) => {
        debug(`got cpu  ${data}`)
        var cpu_temp = (Number(data)/1000 + 273.15).toFixed(2)
        debug(`cpu temp is ${cpu_temp}`)

        app.handleMessage(plugin.id, {
          updates: [
            {
              values: [ {
                path: options.path_cpu_temp,
                value: Number(cpu_temp)
              }]
            }
          ]
        })
      })

      cputemp.on('error', (error) => {
        console.error(error.toString())
      })

      cputemp.stderr.on('data', function (data) {
        console.error(data.toString())
      })
    }

    function getCpuUtil() {
      var cpuutilfull = spawn('sh', ['-c', cpu_util_mpstat_command ])

      cpuutilfull.stdout.on('data', (data) => {
        debug(`got cpu utilisation  ${data}`)
        var re = /all/im
        if (data.toString().match(re)) {
          var cpu_util = data.toString().replace(/(\n|\r)+$/, '').split('\n')
          cpu_util.forEach(function(cpu_util_line){
            var spl_line = cpu_util_line.replace(/ +/g, ' ').split(' ')
            var re2 = /^[0-9]?$/
            if (spl_line[1].match(re2)){
/*              debug(`cpu utilisation core ${spl_line[1]} is ${spl_line[11]}`)
              var pathArray = options.path_cpu_util.toString().split('\.')
              var newPath = pathArray[0] + "."
              for (i=1; i < (pathArray.length - 1); i++) {
                newPath = newPath + pathArray[i].toString() +"."
              }
              newPath = newPath + "core." + (Number(spl_line[1])+1).toString()
              newPath = newPath + "." + pathArray[(pathArray.length-1)]
              var cpu_util_core = ((100 - Number(spl_line[11]))/100).toFixed(2)
              app.handleMessage(plugin.id, {
                updates: [
                  {
                    values: [ {
                      path: newPath,
                      value: Number(cpu_util_core)
                    }]
                  }
                ]
              })
 */           }
            else {
              debug(`cpu utilisation is ${spl_line[11]}`)
              cpu_util_all = ((100 - Number(spl_line[11]))/100).toFixed(2)
              app.handleMessage(plugin.id, {
                updates: [
                  {
                    values: [ {
                      path: options.path_cpu_util,
                      value: Number(cpu_util_all)
                    }]
                  }
                ]
              })
            }
          })
        }
      })

      cpuutilfull.on('error', (error) => {
        console.error(error.toString())
      })

      cpuutilfull.stderr.on('data', function (data) {
        console.error(data.toString())
      })
    }

    function getMemUtil() {
      var memutil = spawn('sh', ['-c', mem_util_command ])

      memutil.stdout.on('data', (data) => {
        debug(`got memory  ${data}`)
        var mem_util = data.toString().replace(/(\n|\r)+$/, '').split('\n')
        mem_util.forEach(function(mem_util_line){
          var splm_line = mem_util_line.replace(/ +/g, ' ').split(' ')
          if (splm_line[0].toString() === "Mem:"){
            var mem_util_per = (Number(splm_line[2])/Number(splm_line[1])).toFixed(2)
            app.handleMessage(plugin.id, {
              updates: [
                {
                  values: [ {
                    path: options.path_mem_util,
                    value: Number(mem_util_per)
                  }]
                }
              ]
            })
          }
        })
      })

      memutil.on('error', (error) => {
        console.error(error.toString())
      })

      memutil.stderr.on('data', function (data) {
        console.error(data.toString())
      })
    }

    function getSdUtil() {
      var sdutil = spawn('sh', ['-c', sd_util_command ])

      sdutil.stdout.on('data', (data) => {
        debug(`got sd  ${data}`)
        var sd_util = Number(data.toString().replace(/(\n|\r)+$/, ''))/100
        app.handleMessage(plugin.id, {
          updates: [
            {
              values: [ {
                path: options.path_sd_util,
                value: Number(sd_util)
              }]
            }
          ]
        })
      })

      sdutil.on('error', (error) => {
        console.error(error.toString())
      })

      sdutil.stderr.on('data', function (data) {
        console.error(data.toString())
      })
    }

    updateEnv()
    setInterval(updateEnv, options.rate * 1000)
  }

  plugin.stop = function() {
    if ( timer ) {
      clearInterval(timer)
      timer =  null
    }
  }

  return plugin
}
