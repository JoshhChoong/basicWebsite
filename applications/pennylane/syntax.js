document.addEventListener("DOMContentLoaded", () => {
    const blocks = document.querySelectorAll(".code-block");

    blocks.forEach(block => {
        // preserve breaks by splitting first
        const originalHtml = block.innerHTML;
        // The browser might normalize HTML, so splitting by <br> tags is safer than newlines
        // Regex to split by <br>, <br/>, <br /> case insensitive
        let lines = originalHtml.split(/<br\s*\/?>/i);
        
        // Remove empty last line if it exists (often created by split)
        if (lines.length > 0 && lines[lines.length - 1].trim() === '') {
            lines.pop();
        }

        const variables = new Set();
        
        // Pass 1: Identify variables (words before '=' signs)
        lines.forEach(line => {
            // Remove HTML tags for parsing text logic
            const text = line.replace(/<[^>]+>/g, ''); 
            
            // Remove comments for variable detection (simplistic # support)
            const cleanLine = text.replace(/#.*/, '');

            // Regex for words before '='
            // Captures simple assignment: x = ...
            // Captures tuple unpacking: x, y, z = ...
            // Captures kwargs: arg=val
            // Ignored == by using negative lookahead (?!=)
            const regex = /((?:[\w]+\s*,\s*)*[\w]+)\s*=(?!=)/g;
            
            let match;
            while ((match = regex.exec(cleanLine)) !== null) {
                // match[1] contains the LHS, e.g. "x, y" or "param"
                const vars = match[1].split(',');
                vars.forEach(v => variables.add(v.trim()));
            }
        });

        // Pass 2: Apply highlighting
        const newLines = lines.map(line => {
            // We need to keep existing HTML tags in the line? 
            // The user's example only shows text and <br>. 
            // Parsing existing HTML AND coloring text is complex. 
            // Assuming plain text content inside the block for this snippet.
            // If there were existing spans, stripping them might be bad, but the source looked plain.
            
            // To be safe, we decode entities? No, innerHTML gives decoded usually.
            // Let's operate on the text derived from the line part.
            
            // Tokenize: Split by anything that is NOT a word character or single quote
            // This isolates "from", "import", "X_train", etc.
            const parts = line.split(/([^\w'])/); 

            return parts.map(token => {
                if (token === 'from' || token === 'import') {
                    return `<span class="keyword-green">${token}</span>`;
                }
                if (variables.has(token)) {
                    return `<span class="variable-blue">${token}</span>`;
                }
                return token;
            }).join('');
        });

        block.innerHTML = newLines.join('<br>');
    });
});
