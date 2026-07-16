const fs = require('fs');
const file = 'src/components/MultiValuationTable.tsx';
let content = fs.readFileSync(file, 'utf8');

// Split into lines
let lines = content.split('\n');

// For each line, check if it has '//' followed by non-comment code later
// Pattern: a line that starts with spaces, has // then some Chinese chars, 
// and then also has code (const, let, function, useEffect, useMemo, useCallback, return, if, for, etc.)
// We need to split such lines

const codeStarts = ['const ', 'let ', 'function ', 'useEffect(', 'useMemo(', 'useCallback(', 'return ', 'if (', 'for (', 'var '];
const fixedLines = [];

for (let line of lines) {
  // Check if this line has a comment AND code after it
  const commentMatch = line.match(/^(\s*)\/\/\s*(.*?)(?:\s+)(const\s|let\s|function\s|useEffect\(|useMemo\(|useCallback\(|return\s|if\s\(|for\s\(|var\s)/);
  if (commentMatch) {
    const indent = commentMatch[1];
    const commentText = commentMatch[2];
    const codeKeyword = commentMatch[3];
    const codeStartPos = line.indexOf(codeKeyword, commentMatch[0].length - codeKeyword.length);
    
    // Actually, let's just find where the code starts
    // Find the keyword position after the comment part
    let codePart = line;
    // Find first occurrence of keyword AFTER '//'
    const commentEnd = line.indexOf('//') + 2;
    let keywordPos = -1;
    for (const kw of codeStarts) {
      const pos = line.indexOf(kw, commentEnd);
      if (pos > 0 && (keywordPos < 0 || pos < keywordPos)) {
        keywordPos = pos;
      }
    }
    
    if (keywordPos > 0) {
      // Split the line: comment line + code line
      const commentLine = line.substring(0, keywordPos).trim();
      const codeLine = indent + line.substring(keywordPos).trimStart();
      fixedLines.push(commentLine);
      fixedLines.push(codeLine);
      continue;
    }
  }
  fixedLines.push(line);
}

content = fixedLines.join('\n');
fs.writeFileSync(file, content, 'utf8');
console.log('Fixed ' + (fixedLines.length - lines.length) + ' lines');
