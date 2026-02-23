import psutil
from typing import Dict, Any
from assistant_cli.models import ExecutionResult
from assistant_cli.utils import logger

class SystemInfo:
    @staticmethod
    def get_disk_space() -> ExecutionResult:
        try:
            disk = psutil.disk_usage('/')
            
            total_gb = disk.total / (1024 ** 3)
            used_gb = disk.used / (1024 ** 3)
            free_gb = disk.free / (1024 ** 3)
            percent = disk.percent
            
            message = (
                f"💾 Disk Space:\n"
                f"  Total: {total_gb:.1f} GB\n"
                f"  Used: {used_gb:.1f} GB ({percent}%)\n"
                f"  Free: {free_gb:.1f} GB"
            )
            
            logger.info("Retrieved disk space info")
            
            return ExecutionResult(
                success=True,
                message=message,
                data={
                    "total_gb": round(total_gb, 1),
                    "used_gb": round(used_gb, 1),
                    "free_gb": round(free_gb, 1),
                    "percent": percent
                }
            )
        
        except Exception as e:
            logger.error("Failed to get disk space: %s", str(e))
            return ExecutionResult(
                success=False,
                message="Failed to retrieve disk space",
                error=str(e)
            )
    
    @staticmethod
    def get_cpu_usage() -> ExecutionResult:
        try:
            cpu_percent = psutil.cpu_percent(interval=1)
            cpu_count = psutil.cpu_count()
            
            message = (
                f"🖥️  CPU Usage:\n"
                f"  Current: {cpu_percent}%\n"
                f"  Cores: {cpu_count}"
            )
            
            logger.info("Retrieved CPU usage info")
            
            return ExecutionResult(
                success=True,
                message=message,
                data={"cpu_percent": cpu_percent, "cpu_count": cpu_count}
            )
        
        except Exception as e:
            logger.error("Failed to get CPU usage: %s", str(e))
            return ExecutionResult(
                success=False,
                message="Failed to retrieve CPU usage",
                error=str(e)
            )
    
    @staticmethod
    def get_memory_usage() -> ExecutionResult:
        try:
            memory = psutil.virtual_memory()
            
            total_gb = memory.total / (1024 ** 3)
            used_gb = memory.used / (1024 ** 3)
            available_gb = memory.available / (1024 ** 3)
            percent = memory.percent
            
            message = (
                f"🧠 Memory Usage:\n"
                f"  Total: {total_gb:.1f} GB\n"
                f"  Used: {used_gb:.1f} GB ({percent}%)\n"
                f"  Available: {available_gb:.1f} GB"
            )
            
            logger.info("Retrieved memory usage info")
            
            return ExecutionResult(
                success=True,
                message=message,
                data={
                    "total_gb": round(total_gb, 1),
                    "used_gb": round(used_gb, 1),
                    "available_gb": round(available_gb, 1),
                    "percent": percent
                }
            )
        
        except Exception as e:
            logger.error("Failed to get memory usage: %s", str(e))
            return ExecutionResult(
                success=False,
                message="Failed to retrieve memory usage",
                error=str(e)
            )
    
    @staticmethod
    def get_all_info() -> ExecutionResult:
        try:
            disk_result = SystemInfo.get_disk_space()
            cpu_result = SystemInfo.get_cpu_usage()
            memory_result = SystemInfo.get_memory_usage()
            
            message = f"{disk_result.message}\n\n{cpu_result.message}\n\n{memory_result.message}"
            
            data = {
                "disk": disk_result.data,
                "cpu": cpu_result.data,
                "memory": memory_result.data
            }
            
            return ExecutionResult(
                success=True,
                message=message,
                data=data
            )
        
        except Exception as e:
            logger.error("Failed to get system info: %s", str(e))
            return ExecutionResult(
                success=False,
                message="Failed to retrieve system information",
                error=str(e)
            )
