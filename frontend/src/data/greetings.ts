type Greeting = { 'zh-CN': string; en: string; source?: { 'zh-CN': string; en: string } }
function line(zh: string, en: string, sourceZh?: string, sourceEn?: string): Greeting {
  return { 'zh-CN': zh, en, ...(sourceZh && sourceEn && { source: { 'zh-CN': sourceZh, en: sourceEn } }) }
}

const periods = {
  morning: [
    line('早上好，今天想研究什么？', 'Good morning. What are you curious about?'),
    line('半亩方塘一鉴开，天光云影共徘徊。', 'A pond opens like a mirror; sky and clouds linger there.', '朱熹《观书有感》', 'Zhu Xi · Reflections on Reading (translation)'),
    line('昨天的笔记里，哪句还想追问？', 'Which line in yesterday’s notes still intrigues you?'),
    line('晨光正好，从哪一页开始？', 'Where shall we begin this morning?'),
  ],
  day: [
    line('哪篇论文让你好奇？', 'Which paper caught your eye?'),
    line('温故而知新，可以为师矣。', 'One who finds new understanding in old lessons can be a teacher.', '《论语·为政》', 'The Analects · Book II (translation)'),
    line('顺着这条引用，会读到什么？', 'Where might this citation lead?'),
    line('把两篇论文并排看，会发现什么？', 'What changes when you read two papers side by side?'),
  ],
  afternoon: [
    line('午后，挑一张图仔细看看？', 'Which figure deserves a closer look this afternoon?'),
    line('读书使人充实。', 'Reading maketh a full man.', '培根《论读书》节译', 'Francis Bacon · Of Studies'),
    line('换一组实验条件，结论还成立吗？', 'Would the result hold under different conditions?'),
    line('今天的发现，能写成一句话吗？', 'Can you put today’s finding into one sentence?'),
  ],
  evening: [
    line('今晚，哪篇论文值得慢慢读？', 'Which paper would you like to linger over tonight?'),
    line('纸上得来终觉浅，绝知此事要躬行。', 'What books teach goes only so far; understanding takes practice.', '陆游《冬夜读书示子聿》', 'Lu You · Reading on a Winter Night (translation)'),
    line('合上论文，你还记得哪个观点？', 'Close the paper. Which idea stays with you?'),
    line('把今天的线索连起来看看？', 'How do today’s clues fit together?'),
  ],
  midnight: [
    line('夜深了，有个念头想留下吗？', 'A late thought worth keeping?'),
    line('哪一句话，值得明天再读？', 'Which line would you like to revisit tomorrow?'),
    line('给读到一半的地方留个记号吧。', 'Leave a bookmark where your thoughts paused.'),
    line('如果只留一条笔记，你会写什么？', 'If you kept just one note, what would it say?'),
  ],
  predawn: [
    line('天还未亮，什么问题浮上心头？', 'Before sunrise, what question comes to mind?'),
    line('昨夜江边春水生，艨艟巨舰一毛轻。', 'The spring river rose overnight; a great ship floats light as a feather.', '朱熹《观书有感》其二', 'Zhu Xi · Reflections on Reading II (translation)'),
    line('把灵感写下来，醒来再细看。', 'Jot down the idea. It can wait for daylight.'),
    line('下一次翻开论文，想从哪里接着读？', 'Where would you like to pick up next time?'),
  ],
}
export function greetingsAt(hour: number): Greeting[] {
  if (hour < 2) return periods.midnight
  if (hour < 5) return periods.predawn
  if (hour < 9) return periods.morning
  if (hour < 13) return periods.day
  if (hour < 18) return periods.afternoon
  return periods.evening
}
