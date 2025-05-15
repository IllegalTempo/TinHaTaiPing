document.addEventListener('DOMContentLoaded', function() {
    const title = document.querySelector('h1');
    
    // Add a subtle animation effect when the page loads
    setTimeout(() => {
        title.style.opacity = '1';
        title.style.transform = 'translateY(0)';
    }, 300);
    
    // Add an event listener for when the user clicks on the title
    title.addEventListener('click', function() {
        // Create a ripple effect
        const colors = ['#ff7675', '#74b9ff', '#55efc4', '#ffeaa7'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        
        // Change the text shadow color
        this.style.textShadow = `2px 2px 4px ${randomColor}`;
        
        // Add a small animation
        this.style.transform = 'scale(1.05)';
        setTimeout(() => {
            this.style.transform = 'scale(1)';
        }, 300);
    });
}); 