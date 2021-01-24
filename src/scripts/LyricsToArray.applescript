on SetLyricsToArray(lyrics)
	set lyricsList to (every paragraph of lyrics)
	set array to "[\"\""
	repeat with lyric in lyricsList
		set lyric to my ReplaceDoubleToSingleQuotation(lyric)
		set array to array & ",\"" & lyric & "\""
	end repeat
	set array to array & "]"
	return array
end SetLyricsToArray

on ReplaceDoubleToSingleQuotation(theText)
	set curDelim to text item delimiters
	set text item delimiters to "\""
	set tmpList to text items of theText
	set text item delimiters to "'"
	set retText to tmpList as string
	set text item delimiters to curDelim
	return retText
end ReplaceDoubleToSingleQuotation
