# 监管违规穿透式查询系统配置文件

# DeepSeek API配置
API_BASE = "https://api.deepseek.com/v1"
API_KEY = "sk-0a57f72b50854ace9d134a5eb697c4dc"  # 请在此处填入您的DeepSeek API密钥

# 数据文件路径
DATA_DIR = "data"

# 输出文件路径
OUTPUT_DIR = "output"

# 系统参数
MAX_TOKENS = 4000  # API调用最大token数
TEMPERATURE = 0.3  # 生成温度，越低越确定

# 可视化参数
FIGURE_SIZE = (16, 12)  # 网络图尺寸
DPI = 300  # 图片分辨率
NODE_SIZE = 3000  # 节点大小
FONT_SIZE = 8  # 字体大小

# 社区匹配参数
MIN_KEYWORD_LENGTH = 2  # 关键词最小长度
FUZZY_MATCH_THRESHOLD = 0.6  # 模糊匹配阈值
