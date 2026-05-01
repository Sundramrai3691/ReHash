(function () {
  function lc(slug) {
    return slug ? `https://leetcode.com/problems/${slug}/` : null;
  }

  function cf(path) {
    return path ? `https://codeforces.com/${path.replace(/^\/+/, "")}` : null;
  }

  function normalizeProblemUrl(url) {
    if (!url) {
      return null;
    }

    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}/`;
    } catch {
      return url;
    }
  }

  function toEntry([id, step, topic, title, leetcodeSlug, codeforcesPath, difficulty]) {
    return {
      id,
      step,
      topic,
      title,
      leetcodeUrl: lc(leetcodeSlug),
      codeforcesUrl: cf(codeforcesPath),
      difficulty,
    };
  }

  const step1 = [
    ["step1-1", "Step 1: Learn the basics", "Language Basics", "User Input / Output", null, null, "Easy"],
    ["step1-2", "Step 1: Learn the basics", "Language Basics", "Data Types", null, null, "Easy"],
    ["step1-3", "Step 1: Learn the basics", "Language Basics", "If Else statements", null, null, "Easy"],
    ["step1-4", "Step 1: Learn the basics", "Language Basics", "Switch Statement", null, null, "Easy"],
    ["step1-5", "Step 1: Learn the basics", "Language Basics", "What are arrays, strings?", null, null, "Easy"],
    ["step1-6", "Step 1: Learn the basics", "Language Basics", "For loops", null, null, "Easy"],
    ["step1-7", "Step 1: Learn the basics", "Language Basics", "While loops", null, null, "Easy"],
    ["step1-8", "Step 1: Learn the basics", "Language Basics", "Functions (Pass by Reference and Value)", null, null, "Easy"],
    ["step1-9", "Step 1: Learn the basics", "Language Basics", "Time Complexity", null, null, "Easy"],
    ["step1-10", "Step 1: Learn the basics", "Pattern Problems", "Patterns", null, null, "Easy"],
    ["step1-11", "Step 1: Learn the basics", "Language Basics", "C++ STL", null, null, "Easy"],
    ["step1-12", "Step 1: Learn the basics", "Language Basics", "Java Collections", null, null, "Easy"],
    ["step1-13", "Step 1: Learn the basics", "Basic Maths", "Count Digits", null, null, "Easy"],
    ["step1-14", "Step 1: Learn the basics", "Basic Maths", "Reverse a Number", null, null, "Easy"],
    ["step1-15", "Step 1: Learn the basics", "Basic Maths", "Check Palindrome", "palindrome-number", null, "Easy"],
    ["step1-16", "Step 1: Learn the basics", "Basic Maths", "GCD Or HCF", null, null, "Easy"],
    ["step1-17", "Step 1: Learn the basics", "Basic Maths", "Armstrong Numbers", null, null, "Easy"],
    ["step1-18", "Step 1: Learn the basics", "Basic Maths", "Print all Divisors", null, null, "Easy"],
    ["step1-19", "Step 1: Learn the basics", "Basic Maths", "Check for Prime", null, null, "Easy"],
    ["step1-20", "Step 1: Learn the basics", "Basic Recursion", "Understand recursion by print something N times", null, null, "Easy"],
    ["step1-21", "Step 1: Learn the basics", "Basic Recursion", "Print name N times using recursion", null, null, "Easy"],
    ["step1-22", "Step 1: Learn the basics", "Basic Recursion", "Print 1 to N using recursion", null, null, "Easy"],
    ["step1-23", "Step 1: Learn the basics", "Basic Recursion", "Print N to 1 using recursion", null, null, "Easy"],
    ["step1-24", "Step 1: Learn the basics", "Basic Recursion", "Sum of first N numbers", null, null, "Easy"],
    ["step1-25", "Step 1: Learn the basics", "Basic Recursion", "Factorial of N numbers", "factorial-trailing-zeroes", null, "Easy"],
    ["step1-26", "Step 1: Learn the basics", "Basic Recursion", "Reverse an array", null, null, "Easy"],
    ["step1-27", "Step 1: Learn the basics", "Basic Recursion", "Check if a string is palindrome or not", "valid-palindrome", null, "Easy"],
    ["step1-28", "Step 1: Learn the basics", "Basic Recursion", "Fibonacci Number", "fibonacci-number", null, "Easy"],
    ["step1-29", "Step 1: Learn the basics", "Basic Hashing", "Hashing Theory", null, null, "Easy"],
    ["step1-30", "Step 1: Learn the basics", "Basic Hashing", "Counting frequencies of array elements", null, null, "Easy"],
    ["step1-31", "Step 1: Learn the basics", "Basic Hashing", "Find the highest/lowest frequency element", null, null, "Easy"],
  ].map(toEntry);

  const step2 = [
    ["step2-1", "Step 2: Learn Important Sorting Techniques", "Elementary Sorting", "Selection Sort", null, null, "Easy"],
    ["step2-2", "Step 2: Learn Important Sorting Techniques", "Elementary Sorting", "Bubble Sort", null, null, "Easy"],
    ["step2-3", "Step 2: Learn Important Sorting Techniques", "Elementary Sorting", "Insertion Sort", null, null, "Easy"],
    ["step2-4", "Step 2: Learn Important Sorting Techniques", "Divide and Conquer", "Merge Sort", null, null, "Medium"],
    ["step2-5", "Step 2: Learn Important Sorting Techniques", "Recursive Sorting", "Recursive Bubble Sort", null, null, "Easy"],
    ["step2-6", "Step 2: Learn Important Sorting Techniques", "Recursive Sorting", "Recursive Insertion Sort", null, null, "Easy"],
    ["step2-7", "Step 2: Learn Important Sorting Techniques", "Divide and Conquer", "Quick Sort", null, null, "Easy"],
  ].map(toEntry);

  const step3 = [
    ["step3-1", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Basics", "Largest Element in an Array", null, null, "Easy"],
    ["step3-2", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Basics", "Second Largest Element in an Array without sorting", null, null, "Easy"],
    ["step3-3", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Basics", "Check if the array is sorted", null, null, "Easy"],
    ["step3-4", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Basics", "Remove duplicates from Sorted array", "remove-duplicates-from-sorted-array", null, "Easy"],
    ["step3-5", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Basics", "Left Rotate an array by one place", null, null, "Easy"],
    ["step3-6", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Basics", "Left rotate an array by D places", null, null, "Easy"],
    ["step3-7", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Basics", "Move Zeros to end", "move-zeroes", null, "Easy"],
    ["step3-8", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Basics", "Linear Search", null, null, "Easy"],
    ["step3-9", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Basics", "Find the Union", null, null, "Medium"],
    ["step3-10", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Basics", "Find missing number in an array", "missing-number", null, "Easy"],
    ["step3-11", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Basics", "Maximum Consecutive Ones", "max-consecutive-ones", null, "Easy"],
    ["step3-12", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Basics", "Find the number that appears once, and the other numbers twice.", "single-number", null, "Medium"],
    ["step3-13", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Subarrays and Prefix Sum", "Longest subarray with given sum K(positives)", null, null, "Medium"],
    ["step3-14", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Subarrays and Prefix Sum", "Longest subarray with sum K (Positives + Negatives)", null, null, "Medium"],
    ["step3-15", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Medium", "2Sum Problem", "two-sum", null, "Medium"],
    ["step3-16", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Medium", "Sort an array of 0's 1's and 2's", "sort-colors", null, "Medium"],
    ["step3-17", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Medium", "Majority Element (>n/2 times)", "majority-element", null, "Easy"],
    ["step3-18", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Subarrays and Prefix Sum", "Kadane's Algorithm, maximum subarray sum", "maximum-subarray", null, "Easy"],
    ["step3-19", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Subarrays and Prefix Sum", "subarray with maximum subarray sum (extended version)", null, null, "Medium"],
    ["step3-20", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Medium", "Stock Buy and Sell", "best-time-to-buy-and-sell-stock", null, "Easy"],
    ["step3-21", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Medium", "Rearrange the array in alternating positive and negative items", "rearrange-array-elements-by-sign", null, "Medium"],
    ["step3-22", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Medium", "Next Permutation", "next-permutation", null, "Medium"],
    ["step3-23", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Medium", "Leaders in an Array problem", null, null, "Easy"],
    ["step3-24", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Medium", "Longest Consecutive Sequence in an Array", "longest-consecutive-sequence", null, "Medium"],
    ["step3-25", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Matrix and Traversal", "Set Matrix Zeros", "set-matrix-zeroes", null, "Medium"],
    ["step3-26", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Matrix and Traversal", "Rotate Matrix by 90 degrees", "rotate-image", null, "Medium"],
    ["step3-27", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Matrix and Traversal", "Print the matrix in spiral manner", "spiral-matrix", null, "Medium"],
    ["step3-28", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Subarrays and Prefix Sum", "Count subarrays with given sum", "subarray-sum-equals-k", null, "Easy"],
    ["step3-29", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Matrix and Traversal", "Pascal's Triangle", "pascals-triangle", null, "Medium"],
    ["step3-30", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Hard", "Majority Element (n/3 times)", "majority-element-ii", null, "Medium"],
    ["step3-31", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Hard", "3-Sum Problem", "3sum", null, "Medium"],
    ["step3-32", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Hard", "4-Sum Problem", "4sum", null, "Hard"],
    ["step3-33", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Subarrays and Prefix Sum", "Largest Subarray with 0 Sum", null, null, "Medium"],
    ["step3-34", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Subarrays and Prefix Sum", "Count number of subarrays with given xor K", null, null, "Hard"],
    ["step3-35", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Hard", "Merge Overlapping Subintervals", "merge-intervals", null, "Medium"],
    ["step3-36", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Hard", "Merge two sorted arrays without extra space", "merge-sorted-array", null, "Medium"],
    ["step3-37", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Hard", "Find the repeating and missing number", "set-mismatch", null, "Hard"],
    ["step3-38", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Hard", "Count Inversions", null, null, "Hard"],
    ["step3-39", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Hard", "Reverse Pairs", "reverse-pairs", null, "Hard"],
    ["step3-40", "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]", "Array Hard", "Maximum Product Subarray", "maximum-product-subarray", null, "Easy"],
  ].map(toEntry);

  const step4 = [
    ["step4-1", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "1D Binary Search", "Binary Search to find X in sorted array", "binary-search", null, "Easy"],
    ["step4-2", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "1D Binary Search", "Implement Lower Bound", null, null, "Easy"],
    ["step4-3", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "1D Binary Search", "Implement Upper Bound", null, null, "Easy"],
    ["step4-4", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "1D Binary Search", "Search Insert Position", "search-insert-position", null, "Easy"],
    ["step4-5", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "1D Binary Search", "Floor/Ceil in Sorted Array", null, null, "Medium"],
    ["step4-6", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "1D Binary Search", "Find first or last occurrence of a given number in a sorted arr", "find-first-and-last-position-of-element-in-sorted-array", null, "Easy"],
    ["step4-7", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "1D Binary Search", "Count occurrences of a number in a sorted array with duplicates", null, null, "Easy"],
    ["step4-8", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "1D Binary Search", "Search in Rotated Sorted Array I", "search-in-rotated-sorted-array", null, "Medium"],
    ["step4-9", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "1D Binary Search", "Search in Rotated Sorted Array II", "search-in-rotated-sorted-array-ii", null, "Medium"],
    ["step4-10", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "1D Binary Search", "Find minimum in Rotated Sorted Array", "find-minimum-in-rotated-sorted-array", null, "Medium"],
    ["step4-11", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "1D Binary Search", "Find out how many times has an array been rotated", null, null, "Easy"],
    ["step4-12", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "1D Binary Search", "Single element in a Sorted Array", "single-element-in-a-sorted-array", null, "Easy"],
    ["step4-13", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "1D Binary Search", "Find peak element", "find-peak-element", null, "Hard"],
    ["step4-14", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "Binary Search on Answers", "Find square root of a number in log n", "sqrtx", null, "Medium"],
    ["step4-15", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "Binary Search on Answers", "Find the Nth root of a number using binary search", null, null, "Medium"],
    ["step4-16", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "Binary Search on Answers", "Koko Eating Bananas", "koko-eating-bananas", null, "Hard"],
    ["step4-17", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "Binary Search on Answers", "Minimum days to make M bouquets", "minimum-number-of-days-to-make-m-bouquets", null, "Hard"],
    ["step4-18", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "Binary Search on Answers", "Find the smallest Divisor", "find-the-smallest-divisor-given-a-threshold", null, "Easy"],
    ["step4-19", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "Binary Search on Answers", "Capacity to Ship Packages within D Days", "capacity-to-ship-packages-within-d-days", null, "Hard"],
    ["step4-20", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "Binary Search on Answers", "Kth Missing Positive Number", "kth-missing-positive-number", null, "Easy"],
    ["step4-21", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "Binary Search on Answers", "Aggressive Cows", null, null, "Hard"],
    ["step4-22", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "Binary Search on Answers", "Book Allocation Problem", null, null, "Hard"],
    ["step4-23", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "Binary Search on Answers", "Split array - Largest Sum", "split-array-largest-sum", null, "Hard"],
    ["step4-24", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "Binary Search on Answers", "Painter's partition", null, null, "Hard"],
    ["step4-25", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "Binary Search on Answers", "Minimize Max Distance to Gas Station", null, null, "Hard"],
    ["step4-26", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "Binary Search on Answers", "Median of 2 sorted arrays", "median-of-two-sorted-arrays", null, "Hard"],
    ["step4-27", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "Binary Search on Answers", "Kth element of 2 sorted arrays", null, null, "Medium"],
    ["step4-28", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "2D Binary Search", "Find the row with maximum number of 1's", null, null, "Easy"],
    ["step4-29", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "2D Binary Search", "Search in a 2 D matrix", "search-a-2d-matrix", null, "Medium"],
    ["step4-30", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "2D Binary Search", "Search in a row and column wise sorted matrix", "search-a-2d-matrix-ii", null, "Medium"],
    ["step4-31", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "2D Binary Search", "Find Peak Element (2D Matrix)", "find-a-peak-element-ii", null, "Hard"],
    ["step4-32", "Step 4: Binary Search [1D, 2D Arrays, Search Space]", "2D Binary Search", "Matrix Median", null, null, "Hard"],
  ].map(toEntry);

  const sheet = [...step1, ...step2, ...step3, ...step4];

  function findByProblemUrl(url) {
    const normalizedTarget = normalizeProblemUrl(url);
    return sheet.find((entry) =>
      [entry.leetcodeUrl, entry.codeforcesUrl]
        .filter(Boolean)
        .some((candidate) => normalizeProblemUrl(candidate) === normalizedTarget),
    ) || null;
  }

  function getStepOrder(stepLabel) {
    const match = String(stepLabel || "").match(/Step\s+(\d+)/i);
    return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
  }

  window.STRIVER_SHEET = sheet;
  window.STRIVER_SHEET_UTILS = {
    findByProblemUrl,
    getStepOrder,
    normalizeProblemUrl,
  };
})();
